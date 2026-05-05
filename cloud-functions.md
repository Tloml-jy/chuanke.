# 云函数接口清单（实现对齐版）

> 权威级别：P0  
> 原则：**以 `cloud/functions/*/index.js` 的真实实现为准**，不写“规划中接口”。  
> 统一返回：`{ code, message, data }`，其中 `code === 0` 表示成功。

---

## 1. 通用约定

### 1.1 调用方式

小程序端统一通过 `miniprogram/utils/request.js` 的封装调用：

- 云函数名：如 `product` / `order` / `system`
- 入参：`{ action: 'xxx', ... }`

### 1.2 登录态

- **大部分 action 需要登录**（云函数内通过 `cloud.getWXContext().OPENID` 判断）
- 少数公开接口无需登录：如 `merchant.listForHome`、`merchant.getById`、`review.getProductReviews`、`review.getServiceReviews`、`system.getHomeNotice`、`system.getHomeBanners`、独立云函数 `getHomeBanners`

### 1.3 关键错误码（跨函数通用语义）

- `0`：成功
- `401`：未登录
- `403`：无权限（越权访问商户/管理员接口）
- `404`：资源不存在（商品/服务/订单/预约/店铺等）
- `422`：参数错误 / action 无效
- `500`：服务器执行失败（异常兜底）
- `1001`：库存不足（订单/商品相关）
- `1002`：状态不允许 / 业务约束冲突（取消、核销、评价等）
- `1003`：预约时段不可用/已约满/内容安全校验失败等（以 message 为准）
- `2001`：商品/服务下架（`status !== 'on'`）

---

## 2. auth（登录与资料）

云函数：`auth`

### 2.1 `login`

- **说明**：获取/创建 `users` 档案；汇总可管理店铺（店主 + `user_shop_relations`）；计算有效角色（`user/merchant/admin`）
- **入参**：`{ action: 'login' }`
- **出参 data**：
  - `openid`
  - `merchantId`：登录后默认店铺（若存在可管理店铺）
  - `shops`：可管理店铺列表（`[{ merchantId, merchantName, shopRole }]`）
  - `profileAuthorized`
  - `profile`：`{ nickName, avatarUrl, gender, country, province, city, language, role }`

### 2.2 `getProfile`

- 入参：`{ action: 'getProfile' }`
- 出参：同 `login`

### 2.3 `updateProfile`

- 入参：`{ action: 'updateProfile', profile: { nickName, avatarUrl, gender, country, province, city, language } }`
- 出参：同 `login`（并置 `profileAuthorized=true`）

### 2.4 `logout`

- 入参：`{ action: 'logout' }`
- 出参：`{ openid, profileAuthorized: false }`

---

## 3. product（商品）

云函数：`product`

### 3.1 用户侧

#### 3.1.1 `getList`

- **说明**：商品列表（仅返回 `status='on'` 且店铺 `status='approved'`）
- 入参：
  - `action: 'getList'`
  - `page`（默认 1）
  - `pageSize`（默认 10，最大 20）
  - `keyword`（可选，按 name 模糊）
  - `categoryId`（可选，兼容 `cat_001...`）
  - `merchantId`（可选，指定店铺）
  - `sort`（可选）：`sales | price_asc | price_desc | rating | newest(缺省)`（实现以缺省 `createTime desc` 为 newest）
- 出参 data：`{ list, total, page, pageSize, hasMore }`

#### 3.1.2 `getDetail`

- 入参：`{ action:'getDetail', productId }`
- 出参 data：商品详情（含 `merchant`、多图、SKU 信息）
  - 多规格：`skuMode='matrix'` 时返回 `skuSpecOrder` 与 `skus`

### 3.2 商户侧（商品管理 + 规格模板）

> 需满足：店主/店员（`canOpenidManageMerchant`）或兼容演示 `users.role=merchant`

#### 3.2.1 `getMerchantMerged`

- **说明**：商户端商品管理合并列表（同时包含商品与服务，用于“商品管理”页）
- 入参：`{ action:'getMerchantMerged', merchantId, statusTab, keyword?, page?, pageSize? }`
  - `statusTab`：`all | on | off | bookable`
    - `bookable`：仅返回可预约服务（走 `services`）

#### 3.2.2 `merchantCreate`

- 入参（核心）：`{ action:'merchantCreate', merchantId, name, priceFen, images, stock?, categoryId?, subtitle?, pickupPoint?, description?, skuMode?, skuSpecOrder?, skus?, skuTemplateIds? }`
- 说明：
  - `priceFen` 单位分
  - `images` 至少 1 张
  - `skuMode='matrix'` 时需提供 `skus`（矩阵行：specs/priceFen/stock）

#### 3.2.3 `merchantUpdate`

- 入参：`{ action:'merchantUpdate', merchantId, productId, ...同创建字段 }`

#### 3.2.4 `merchantGet`

- 入参：`{ action:'merchantGet', merchantId, productId }`
- 出参：用于编辑页（含 `descriptionPlain`、SKU 列表等）

#### 3.2.5 `merchantSetStatus`

- 入参：`{ action:'merchantSetStatus', merchantId, productId, nextStatus:'on'|'off' }`

#### 3.2.6 `listSpecTemplates` / `saveSpecTemplate` / `removeSpecTemplate`

- 规格模板集合：`shop_spec_templates`
- `listSpecTemplates` 入参：`{ action:'listSpecTemplates', merchantId }`
- `saveSpecTemplate` 入参：`{ action:'saveSpecTemplate', merchantId, templateId?, name, values }`
- `removeSpecTemplate` 入参：`{ action:'removeSpecTemplate', merchantId, templateId }`

---

## 4. service（服务/可预约时段）

云函数：`service`

### 4.1 用户侧

#### 4.1.1 `getList`

- 入参：`{ action:'getList', page?, pageSize?, keyword?, categoryId?, merchantId?, sort? }`
- sort：`sales | rating | price_asc | price_desc | newest(缺省)`

#### 4.1.2 `getDetail`

- 入参：`{ action:'getDetail', serviceId }`
- 出参：含 `timeTemplate`（已归一化）与店铺信息

#### 4.1.3 `getAvailableSlots`

- **说明**：查询某天可预约时段，并返回已预约数/容量
- 入参：`{ action:'getAvailableSlots', serviceId, date:'YYYY-MM-DD' }`

### 4.2 商户侧（服务管理）

- `merchantCreate`：`{ action:'merchantCreate', merchantId, name, priceFen, images, ... }`
- `merchantUpdate`：`{ action:'merchantUpdate', merchantId, serviceId, ... }`
- `merchantGet`：`{ action:'merchantGet', merchantId, serviceId }`
- `merchantSetStatus`：`{ action:'merchantSetStatus', merchantId, serviceId, nextStatus:'on'|'off' }`

---

## 5. order（订单：创建/列表/取消/核销/退款/支付回调分发）

云函数：`order`

### 5.1 用户侧

#### 5.1.1 `createDirect`

- **说明**：直接从商品详情创建订单（微信支付下单占位），订单初始 `status=unpaid`
- 入参：`{ action:'createDirect', productId, skuId?, remark?, paymentIntent:'wechat' }`
- 出参：`{ orderId, orderNo, totalAmount, status:'unpaid', payment }`

#### 5.1.2 `getList` / `getMyList`

- 入参：`{ action:'getList'|'getMyList', status:'all'|具体状态, page?, pageSize? }`
- 出参：`{ list, total, page, pageSize, hasMore }`

#### 5.1.3 `getDetail`

- 入参：`{ action:'getDetail', orderId }`
- 说明：`pending_pickup` 且存在 `pickupCode` 时会懒生成 `pickupCodeQr`

#### 5.1.4 `cancel`

- 入参：`{ action:'cancel', orderId, reason? }`
- 说明：已支付微信单会发起退款，并将 `paymentStatus` 置为 `refund_processing`

#### 5.1.5 `confirmMockPayment`

- **说明**：仅 `payMode=mock` 环境允许，模拟支付成功（扣库存并进入 `pending_prepare`）
- 入参：`{ action:'confirmMockPayment', orderId }`

### 5.2 商户侧

#### 5.2.1 `getMerchantOrders`

- 入参：`{ action:'getMerchantOrders', merchantId, status:'all'|具体状态, page?, pageSize? }`

#### 5.2.2 `getMerchantOrderDetail`

- 入参：`{ action:'getMerchantOrderDetail', merchantId, orderId }`

#### 5.2.3 `getOrderByPickupCode`

- 入参：`{ action:'getOrderByPickupCode', merchantId, pickupCode }`

#### 5.2.4 `merchantMarkStockReady`

- **说明**：商户备货完成，生成 6 位核销码，订单进入 `pending_pickup`
- 入参：`{ action:'merchantMarkStockReady', merchantId, orderId }`

#### 5.2.5 `verifyPickup`

- **说明**：核销订单（进入 `completed`，并入账到财务台账）
- 入参：`{ action:'verifyPickup', merchantId, orderId, pickupCode }`

#### 5.2.6 `refund`

- **说明**：商户发起退款（仅已支付微信单）
- 入参：`{ action:'refund', merchantId, orderId, reason? }`

### 5.3 支付中心回调（仅内部调用）

- `handlePayNotify`：支付回调分发入口（由 `payment.handleWechatPayNotify` 转发）
- `handleRefundNotify`：退款回调分发入口（由 `payment.handleWechatPayNotify` 转发）

---

## 6. booking（预约：创建/列表/取消/商户确认/完成/退款/支付回调分发）

云函数：`booking`

### 6.1 用户侧

- `create`：`{ action:'create', serviceId, bookingDate, bookingSlot:{start,end}, paymentMethod:'wechat', remark? }`
- `getList` / `getMyList`：同订单列表语义
- `getDetail`：`{ action:'getDetail', bookingId | bookingNo }`
- `cancel`：`{ action:'cancel', bookingId|bookingNo, reason? }`
- `confirmMockPayment`：mock 环境模拟支付成功（`unpaid -> pending_confirm`）

### 6.2 商户侧

- `getMerchantBookings`：`{ action:'getMerchantBookings', merchantId, status?, page?, pageSize? }`
- `getMerchantBookingDetail`：`{ action:'getMerchantBookingDetail', merchantId, bookingId|bookingNo }`
- `confirm`：`pending_confirm -> confirmed`
- `reject`：拒绝并取消（已支付则走退款）
- `complete`：`confirmed -> completed`（并入账）
- `refund`：商户主动退款（已支付微信单）

### 6.3 支付中心回调（仅内部调用）

- `handlePayNotify`
- `handleRefundNotify`

---

## 7. merchant（店铺/关注/商户准入/管理员开店）

云函数：`merchant`

### 7.1 公开接口（无需登录）

- `listForHome`：首页/逛店铺 列表（仅 approved）
- `getById`：店铺资料（停用店铺对外返回空结构）

### 7.2 关注（需登录）

- `followMerchant` / `unfollowMerchant`
- `checkFollow`
- `getMyFollowedMerchants`

### 7.3 商户模式准入（需登录）

- `getMyMerchantAccess`
  - 优先返回 `user_shop_relations` / 店主店铺；否则若 `users.role==='merchant'` 返回可进入但提示“未绑定店铺”

### 7.4 商户店铺设置（需登录且有权限）

- `getShopSettings`
- `updateShopSettings`

### 7.5 管理员后台（需管理员）

- `adminCreateAndOpenShop`：线下审核通过后创建并开通店铺（含幂等）
- `adminListShops`
- `adminSuspendShop` / `adminResumeShop`

### 7.6 已下线能力（保持明确提示）

- `apply`：线上入驻申请（已下线）
- `getMyApplication` / `getApplyList` / `review`：线上审核链路（已下线或返回空）

---

## 8. system（系统配置：公告/客服/支付配置/轮播图）

云函数：`system`

### 8.1 公告

- `getHomeNotice`（公开）
- `getMerchantNotice`（公开，但需 merchantId）
- 管理端读取：
  - `getHomeNoticeAdmin`（管理员）
  - `getMerchantNoticeAdmin`（管理员或店铺可管理者）
- 管理端写入：
  - `setHomeNotice`（管理员）
  - `setMerchantNotice`（管理员或店铺可管理者）

### 8.2 客服配置

- `getContactConfig`（公开）
- `setContactConfig`（管理员）

### 8.3 支付配置（管理员）

- `getPayConfig`
- `setPayConfig`

### 8.4 轮播图

- `getHomeBanners`（公开）
- 管理端：
  - `adminListBanners`
  - `adminUpsertBanner`
  - `adminDeleteBanner`

---

## 9. payment（微信支付通知统一入口）

云函数：`payment`

- `getNotifyConfigSummary`
- `previewNotifyVerify`
- `previewNotifyDecrypt`
- `handleWechatPayNotify`
  - **说明**：验签/解密后更新 `payment_transactions`/`payment_refunds`，并分发到 `order.handlePayNotify` 或 `booking.handlePayNotify`

---

## 10. finance（商户财务/提现/管理员审核打款）

云函数：`finance`（均需登录）

### 10.1 商户侧（需店铺可管理者）

- `getOverview`
- `getLedgerList`
- `applyWithdraw`
- `getWithdrawList`

### 10.2 管理员侧

- `adminListWithdrawals`
- `adminApproveWithdrawal`
- `adminRejectWithdrawal`
- `adminMarkWithdrawalPaid`

---

## 11. review（评价：提交/列表/商户回复/管理员审核）

云函数：`review`

### 11.1 前台展示（公开）

- `getProductReviews`
- `getServiceReviews`

### 11.2 评价入口辅助

- `findReviewableOrderForProduct`（登录后返回可评价订单 id；未登录返回空）
- `findReviewableBookingForService`（同上）
- `getReviewSubmitContext`（需登录；返回剩余可评次数与购买/预约快照）

### 11.3 用户提交（需登录）

- `submitReview`
  - `bizType='order'`：`{ orderId, productId? }`（支持“同订单多件多评”配额）
  - `bizType='booking'`：`{ bookingId }`

### 11.4 商户侧（需店铺可管理者）

- `merchantListReviews`
- `merchantReplyReview`
- `getMerchantRecent`（工作台近期动态：最近评价）

### 11.5 管理员侧

- `adminListReviews`
- `adminSetReviewHidden`（隐藏/恢复）
- `adminDeleteReview`
- `adminBatchReviewOps`

---

## 12. im（买家-商户私聊）

云函数：`im`（均需登录）

- `createOrGetConversation`
- `getConversation`
- `listConversations`（当前用户所有会话，用于“消息”tab）
- `listMerchantConversations`（商户端会话列表）
- `listMessages`（latest/older/newer）
- `sendMessage`（text/image/product）
- `markRead`
- `getUnreadTotal`（当前用户未读总数）
- `getMerchantUnreadTotal`（某店铺商户侧未读总数）

---

## 13. bootstrap（初始化/迁移/维护脚本）

云函数：`bootstrap`

- `checkCollections`
- `initProductDemo` / `clearProductDemo` / `resetProductDemo`
- `initServiceDemo` / `clearServiceDemo`
- `initSystemConfig`
- `initHomeNoticeConfig`
- `initMerchantNoticeConfig`
- `migrateUserShopRelationsFromOwners`
- `clearDemoMerchantsDeep`
- `clearMerchantsDeepByIds`
- `dedupePaymentTransactionsByOutTradeNo`

---

## 14. booking-timeout（定时取消超时预约）

云函数：`booking-timeout`

- `runAll`
- `cancelUnpaid`（默认 30 分钟）
- `cancelPendingConfirm`（默认 24 小时）

---

## 15. order-timeout（订单超时治理）

云函数：`order-timeout`

- `runAll`
- `cancelUnpaid`（默认 30 分钟，自动取消未支付订单）
- `markPendingPickupOverdue`（默认 24 小时，自动标记待自提超时）

---

## 16. getHomeBanners（独立轮播云函数）

云函数：`getHomeBanners`（无 action）

- 返回：`banners` 集合中符合条件的轮播列表（与 `system.getHomeBanners` 同逻辑）

---

## 17. common（仅上传兼容）

云函数：`common`

- `ping`：返回模块说明（业务不要调用）

---

*更新日期：2026-04-28*  
*对齐范围：`cloud/functions/*/index.js`（以当前仓库代码为准）*