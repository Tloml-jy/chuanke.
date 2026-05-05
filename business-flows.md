# 业务流程（实现对齐版）

> 权威级别：P0  
> 说明：本文件描述“现网可用闭环”的主路径与关键异常分支；接口与入参请配合 `cloud-functions.md` 使用。  
> 约束：当前版本 **仅支持到店自提**（不支持配送）。

---

## 1. 角色与边界

- **用户（user）**：浏览商品/服务、下单（微信支付）、预约（微信支付）、查看/取消、评价
- **商户（merchant）**：商品/服务管理、订单备货/核销、预约确认/完成、查看评价与回复、财务提现申请
- **管理员（admin）**：公告/轮播/客服/支付配置维护、线下开通店铺、审核提现、评价治理

> 权限最终以云函数校验为准（前端仅做交互限制）。

---

## 2. 流程一：商品购买（到店自提）与核销

### 2.1 主路径（支付 -> 备货 -> 待自提 -> 核销完成）

1. 用户在商品详情点击“立即购买”
2. 小程序调用 `order.createDirect`
   - 创建占位订单：`status=unpaid`，不扣库存
   - 返回 `payment`（JSAPI 参数）
3. 用户完成微信支付
4. 支付通知由 `payment.handleWechatPayNotify` 统一接收与验签解密
5. 支付中心分发到 `order.handlePayNotify`
6. 订单更新为：
   - `status=pending_prepare`
   - `paymentStatus=paid`
   - **此阶段不生成核销码**（避免未备货就被核销）
7. 商户在订单详情点击“备货完成”
8. 小程序调用 `order.merchantMarkStockReady`
   - 生成 6 位 `pickupCode`
   - 订单变更为 `status=pending_pickup`
9. 用户订单详情展示核销码（并可展示二维码 `pickupCodeQr`）
10. 商户在核销页输入/扫码核销码，调用：
    - `order.getOrderByPickupCode`（查询校验）
    - `order.verifyPickup`（执行核销）
11. 核销成功：
    - 订单 `status=completed`
    - 写入 `pickupTime/pickupBy`
    - 写入 `operationLogs`
    - 入账：生成 `merchant_fund_ledger`（`order_income`）
    - 累加销量：按订单行 `quantity` 增加 `products.salesCount`

### 2.2 关键异常分支

- **商品下架**：`product.getDetail` / `order.createDirect` 返回 `2001`
- **库存不足**：
  - `order.confirmMockPayment` 或正式回调扣库存阶段校验不足返回 `1001`
- **取消订单（用户）**：
  - `unpaid` 或允许取消的状态可 `order.cancel`
  - 若已支付微信单：发起微信退款，并置 `paymentStatus=refund_processing`
- **退款（商户主动）**：
  - `order.refund` 发起退款（仅已支付微信单）
  - 退款通知走 `payment.handleWechatPayNotify` -> `order.handleRefundNotify`，最终订单进入 `status=refunded`
  - 退款完成后：回滚库存/规格库存，并冲账（`reverseLedgerEntry`）
- **核销失败**：
  - 核销码不匹配 / 状态不可核销 -> `1002`
  - 越权核销（非本店）-> `403`

---

## 3. 流程二：服务预约（支付 -> 待确认 -> 确认 -> 完成）

### 3.1 主路径

1. 用户在服务详情选择日期与时段
   - 时段来源：`service.getAvailableSlots`
2. 用户提交预约，调用 `booking.create`
   - 创建预约：`status=unpaid`
3. 用户完成微信支付
4. 支付中心 `payment.handleWechatPayNotify` 分发到 `booking.handlePayNotify`
5. 预约更新为：
   - `status=pending_confirm`
   - `paymentStatus=paid`
6. 商户确认预约：`booking.confirm` -> `status=confirmed`
7. 商户完成服务：`booking.complete` -> `status=completed`
8. 完成时入账：生成 `merchant_fund_ledger`（`booking_income`）

### 3.2 时段冲突与容量

- 创建预约前会校验该时段已占用数量（状态为 `unpaid/pending_confirm/confirmed` 的预约视为占用）
- 超过 slot 的 `maxBookings` 则返回 `1003`（“已约满/不可预约”）

### 3.3 取消/拒绝/退款

- **用户取消**：`booking.cancel`
  - 仅允许 `unpaid` / `pending_confirm`
  - 已支付微信单：发起退款，置 `paymentStatus=refund_processing`
- **商户拒绝**：`booking.reject`
  - 仅允许 `pending_confirm`
  - 已支付微信单：发起退款
- **商户退款**：`booking.refund`（仅已支付微信单）
- **退款回调**：`payment.handleWechatPayNotify` -> `booking.handleRefundNotify`，最终预约进入 `status=refunded`

---

## 4. 流程三：评价（订单/预约完成后）

### 4.1 入口规则

- 订单：仅 `status=completed` 可评
- 预约：仅 `status=completed` 可评

### 4.2 订单“多件多评”规则（实现口径）

- 可评次数按订单商品行的 `quantity` 汇总
- 以 `reviews` 集合真实写入条数为准，避免仅依赖 `orders.reviewSubmitCount` 产生偏差

### 4.3 评价提交

1. 评价页可先调用 `review.getReviewSubmitContext` 获取：
   - 购买/预约快照、可评配额、剩余次数
2. 提交评价：`review.submitReview`
3. 写时扩散：
   - 商品：更新 `products.rating/reviewCount`
   - 服务：更新 `services.rating/reviewCount`
   - 店铺：更新 `merchants.shopRating/shopReviewCount`（与运营字段 `rating` 解耦）

### 4.4 管理与回复

- 商户回复：`review.merchantReplyReview`
- 管理员隐藏/恢复/删除：`review.adminSetReviewHidden` / `review.adminDeleteReview` / `review.adminBatchReviewOps`

---

## 5. 流程四：商户准入（线下开通）

> 线上入驻申请已下线（`merchant.apply` 会直接返回提示）。

### 5.1 主路径

1. 用户线下提交材料
2. 管理员在小程序管理员端执行“开通店铺”
3. 调用 `merchant.adminCreateAndOpenShop`
   - 写入 `merchants(status=approved, ownerOpenid)`
   - 写入/更新 `user_shop_relations(relationRole=owner)`
   - 同步 `users.role=merchant`（非 admin 场景）
4. 用户重新登录/刷新后，`auth.login`/`merchant.getMyMerchantAccess` 返回可进入商户模式与默认 `merchantId`

---

## 6. 流程五：系统配置（公告/客服/轮播/支付）

### 6.1 公告

- 用户端：首页调用 `system.getHomeNotice`
- 商户端：工作台调用 `system.getMerchantNotice`
- 管理端：管理员或店铺可管理者调用 `setHomeNotice/setMerchantNotice` 更新配置

### 6.2 客服配置

- 用户端：`system.getContactConfig`
- 管理端：`system.setContactConfig`

### 6.3 轮播图

- 用户端：首页调用 `system.getHomeBanners` 或独立云函数 `getHomeBanners`
- 管理端：`system.adminUpsertBanner/adminDeleteBanner`

### 6.4 支付配置

- 管理端：`system.getPayConfig/setPayConfig`
- 支付通知统一入口：`payment.handleWechatPayNotify`

---

## 7. 流程六：预约超时自动取消（定时任务）

云函数：`booking-timeout`

- `cancelUnpaid`：默认 30 分钟未支付自动取消
- `cancelPendingConfirm`：默认 24 小时待确认自动取消
- `runAll`：一次执行两类扫描取消

---

## 8. 流程七：订单超时治理（定时任务）

云函数：`order-timeout`

- `cancelUnpaid`：默认 30 分钟未支付自动取消订单（`status=unpaid -> cancelled`）
- `markPendingPickupOverdue`：默认 24 小时待自提自动标记超时（`pickupOverdue=true`）
- `runAll`：一次执行上述两类扫描
- `autoRefundOverduePickup`：待自提超时自动退款编排（第一版，默认 `dryRun=true`）

说明：

- 创建订单时会写入 `payExpireAt`，便于前后端统一支付过期口径
- 商户点“备货完成”时会写入 `pickupReadyTime` 与 `pickupDeadlineAt`，超时扫描优先以截止时间为准
- 当前“待自提超时”先做标记，不直接自动退款，避免未完成微信退款就关单
- 自动退款第一版已提供独立 action，且 `runAll` 需显式 `enableAutoRefund=true` 才会执行
- 可通过 `system_settings/order_biz_rules` 配置 `unpaidTimeoutMinutes` 与 `pickupTimeoutHours`（缺省 30 分钟 / 24 小时）

---

*更新日期：2026-04-28*  
*对齐范围：`cloud/functions/{order,booking,review,merchant,system,payment,booking-timeout,order-timeout}`*