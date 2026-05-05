# 数据模型设计（2026-04 对齐版）

> 目标：让前端、云函数、AI 协作时对字段语义保持一致。  
> 原则：以当前云函数真实读写字段为准，不写“未落地理想字段”。

---

## 1. 核心集合

当前业务主链路使用的集合：

- `products`：商品
- `product_skus`：商品 SKU（多规格矩阵）
- `services`：服务
- `orders`：订单
- `bookings`：预约
- `merchants`：商户
- `reviews`：用户评价（订单/预约完成后写入）
- `user_shop_relations`：用户与店铺的绑定（一用户多店；线下审核后写入）
- `merchant_applications`：商户入驻申请（**已下线**，保留集合用于历史数据兼容）
- `system_settings`：系统配置（公告/客服）
- `banners`：首页轮播图
- `users`：用户档案（含角色与授权态 `profileAuthorized`）
- `merchant_follows`：店铺关注关系
- `payment_transactions`：支付单（统一支付凭证层）
- `payment_refunds`：退款单（统一退款凭证层）
- `merchant_wallets`：商户钱包快照（可提现余额等，由财务模块维护/回填）
- `merchant_fund_ledger`：商户资金流水台账（入账/退款冲账/提现支出等）
- `merchant_withdrawals`：提现申请单（商户提交、管理员审核/确认打款）
- `conversations`：IM 会话
- `messages`：IM 消息
- `shop_spec_templates`：店铺规格模板（供商品 SKU 编辑复用）
- `merchant_admin_logs`：管理员操作日志（开店/停用/恢复/财务等）
- `merchant_admin_idempotency`：管理员幂等键（避免重复开通）

---

## 2. products（商品）

关键字段：

- `_id`
- `merchantId`
- `categoryId`
- `name`, `subtitle`
- `images`（数组，首图用于列表）
- `price`, `originalPrice`（单位：分）
- `stock`
- `status`（云函数仅返回 `on`）
- `pickupPoint`
- `salesCount`, `rating`, `reviewCount`
- `createTime`

索引建议：

- `status + createTime`
- `merchantId + status`
- `categoryId + status`

---

## 3. services（服务）

关键字段：

- `_id`
- `merchantId`
- `categoryId`
- `name`, `subtitle`
- `coverImage`, `images`
- `description`, `providerIntro`
- `price`, `priceUnit`, `duration`
- `timeTemplate`（可预约时段模板）
- `status`
- `bookingCount`, `rating`, `reviewCount`
- `createTime`

索引建议：

- `status + createTime`
- `merchantId + status`
- `categoryId + status`

---

## 4. orders（订单）

关键字段（按当前实现）：

- `_id`, `orderNo`
- `_openid`（买家）
- `merchantId`, `merchantName`
- `items`（冗余商品快照）
- `totalAmount`, `deliveryFee`
- `deliveryType`（当前主用 pickup）
- `paymentMethod`, `paymentStatus`
- `pickupCode`, `pickupCodeQr`, `pickupCodeQrPayload`
- `pickupPoint`
- `status`
- `remark`, `cancelReason`
- `pickupTime`, `pickupBy`, `cancelTime`
- `operationLogs`
- `createTime`, `updateTime`

状态：

- `pending_pickup`
- `completed`
- `cancelled`
- `unpaid`（兼容字段，部分流程可见）
- `refunded`（兼容字段，当前主流程未完整打通）

索引建议：

- `_openid + createTime`
- `merchantId + createTime`
- `status + createTime`
- `pickupCode + merchantId`
- `orderNo`（唯一）

---

## 5. bookings（预约）

关键字段：

- `_id`, `bookingNo`
- `_openid`
- `merchantId`, `merchantName`
- `serviceId`, `serviceName`
- `bookingDate`
- `bookingSlot.start`, `bookingSlot.end`
- `price`
- `paymentMethod`, `paymentStatus`
- `status`
- `remark`, `cancelReason`
- `merchantConfirmTime`, `completeTime`, `cancelTime`
- `operationLogs`
- `createTime`, `updateTime`

状态：

- `unpaid`
- `pending_confirm`
- `confirmed`
- `completed`
- `cancelled`

索引建议：

- `_openid + createTime`
- `merchantId + createTime`
- `serviceId + bookingDate + status`
- `bookingNo`（唯一）

---

## 5.1 reviews（用户评价）

关键字段（与 `cloud/functions/review` 一致）：

- `_openid`、`bizType`（`order` | `booking`）
- `orderId` / `bookingId`、`productId` / `serviceId`、`merchantId`
- `rating`（1～5）、`content`、`images`
- `nickName`、`avatarUrl`
- `createTime`

**控制台复合索引（请在云开发 → 数据库 → reviews → 索引 中手动创建）：**

- `productId` + `createTime`（降序）— 商品评价列表 `getProductReviews`
- `merchantId` + `createTime`（降序）— 商户侧近期评价 / 未来店铺评价列表
- `serviceId` + `createTime`（降序）— 服务评价列表 `getServiceReviews`（查询条件含 `bizType: booking` 时建议与 `bizType` 同查）
- 校验「是否已评价」：视实现使用 `_openid` + `orderId` 或 `bookingId` 等组合索引

---

## 6. merchants（商户）

关键字段（当前代码会读写）：

- `_id`
- `userId`, `ownerOpenid`
- `name`, `logo`, `banner`
- `description`
- `businessScope`, `categoryIds`
- `contactPhone`, `contactWechat`
- `pickupPoint`
- `isCertified`
- `status`（`approved` 等）
- `announcement`
- `rating`（运营/兼容展示，可与店铺聚合评分并存）
- `shopRating`、`shopReviewCount`（用户评价「写时扩散」聚合，由 `review` 云函数在事务中更新）
- `followerCount`（关注数，与评价独立）
- `productCount`, `orderCount`
- `createTime`, `updateTime`, `approveTime`

索引建议：

- `userId`（唯一）
- `status`

---

## 6.1 user_shop_relations（用户-店铺绑定）

用于 **非店主** 与店铺的授权关系（店主仍可通过 `merchants.ownerOpenid` 识别；也可用 bootstrap 从 owner 同步一行关系便于统一查询）。

关键字段：

- `_openid`：用户 openid（与 `users` 一致，自定义集合需写入）
- `merchantId`：店铺 ID（对应 `merchants._id`）
- `status`：`active`（停用可改为 `inactive`）
- `relationRole` / `shopRole`：可选，`owner` / `manager` / `staff` 等
- `createTime`, `updateTime`

权限校验（云函数）：`merchants.ownerOpenid === openid` **或** `user_shop_relations` 命中 **或** 兼容演示 `users.role === 'merchant'`（与 `merchantAccess` 一致）。

索引建议：

- `_openid + merchantId`（唯一）
- `_openid + status`

---

## 7. merchant_applications（入驻申请）

关键字段：

- `_id`
- `applicantOpenid`
- `status`（`pending | approved | rejected`）
- `merchantId`, `merchantName`
- `identityInfo`（身份资料）
- `operationInfo`（经营信息）
- `managementInfo`（后台账号与结算信息）
- `contactPhone`, `contactWechat`
- `pickupPoint`, `description`, `businessScope`
- `rejectReason`, `reviewBy`, `reviewTime`
- `createTime`, `updateTime`

索引建议：

- `applicantOpenid + createTime`
- `status + createTime`

> 备注：线上入驻申请已下线（云函数 `merchant.apply` 会直接返回提示），但集合字段保留用于历史数据兼容与可能的运营回溯。

---

## 8. system_settings（系统配置）

文档 ID 约定：

- `contact`：客服配置
- `home_notice`：首页公告
- `merchant_notice_<merchantId>`：商户公告
- `pay_config`：支付配置（管理员维护）

公告字段结构：

- `enabled`
- `notices`（数组项包含 `id/text/tag/priority/startTime/endTime/enabled/order`）
- `noticeText`（冗余文本）
- `updateTime`

---

## 9. 字段设计约定（AI 必读）

- 价格统一“分”为单位，前端展示时使用 `fenToYuan`
- 订单/预约中的 `name/image/merchantName` 为冗余快照，前端优先读快照
- 时间字段存在 `Date` 与 `ISO 字符串`并存情况，前端展示需做容错格式化
- 任何“状态流转”都必须由云函数做最终校验，前端仅做交互限制

---

*更新日期：2026-04-10*  
*对齐范围：`cloud/functions/{product,service,order,booking,merchant,auth,system,bootstrap}`*