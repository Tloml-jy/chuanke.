# 现网 Action → 页面入口 → 数据表字段 对照清单

> **生成日期**：2026-04-28  
> **可信级别**：P0（直接读取代码生成，与现网实现 100% 对齐）  
> **使用说明**：AI 或开发者改需求前先查本表。仅保留现网有效项，已下线/暂停开发项已过滤。  
> **数据来源**：`cloud/functions/*/index.js` + `miniprogram/pages/**/*.js` + `miniprogram/utils/*.js`

---

## 通用约定

| 项 | 说明 |
|---|---|
| 调用方式 | `utils/request.js` → `call('云函数名', { action: 'xxx', ... })` |
| 返回格式 | `{ code: 0 成功, message, data }` |
| 价格单位 | **分**（前端展示用 `fenToYuan` 转元） |
| 状态校验 | 前端仅做交互限制，最终权限与状态流转以云函数为准 |
| 登录态 | 大部分 action 需登录（`cloud.getWXContext().OPENID`）；公开接口已标注 |

---

## 一、auth（认证与用户）

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 1 | `login` | `pages/auth/login/login`、`app.js` | 微信授权登录 | `users(_openid,role,profileAuthorized,nickName,avatarUrl)`, `user_shop_relations(_openid,merchantId)`, `merchants(ownerOpenid,status)` | `users(role,lastLoginTime,createTime,updateTime)` | ✅ |
| 2 | `getProfile` | `app.js`(启动同步) | 获取用户资料 | `users(_openid,role,nickName,avatarUrl,profileAuthorized)`, `user_shop_relations` | — | ✅ |
| 3 | `updateProfile` | `pages/auth/login/login` | 更新头像昵称 | `users(_openid)` | `users(nickName,avatarUrl,profileAuthorized,updateTime)` | ✅ |
| 4 | `logout` | `pages/admin/dashboard/dashboard` | 退出登录 | — | `users(profileAuthorized=false)` | ✅ |

---

## 二、product（商品）

### 2.1 用户端

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 5 | `getList` | `pages/index/index`(首页推荐)、`pages/product/list/list`(商品列表)、`pages/search/search`(搜索)、`pages/shop/detail/detail`(店铺内商品)、`pages/admin/banners/banners`(管理员搜关联) | 浏览/搜索商品 | `products(status='on', name, images, price, stock, salesCount, rating, merchantId, categoryId)` | — | ✅ |
| 6 | `getDetail` | `pages/product/detail/detail` | 查看商品详情 | `products(*)`, `product_skus(specs,price,stock)` | — | ✅ |

### 2.2 商户端

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 7 | `getMerchantMerged` | `pages/merchant/products/products` | 商品管理列表(含服务) | `products(merchantId,status,name,price,stock)`, `services(merchantId,status,name,price)` | — | ✅ |
| 8 | `merchantCreate` | `pages/merchant/goods-edit/goods-edit` | 新建商品(含SKU矩阵) | — | `products(name,images,price,stock,skuMode,status,...)`, `product_skus(specs,price,stock)` | ✅ |
| 9 | `merchantUpdate` | `pages/merchant/goods-edit/goods-edit` | 编辑商品 | `products(_id,merchantId)` | `products(同创建字段)`, `product_skus`(删旧插新) | ✅ |
| 10 | `merchantGet` | `pages/merchant/goods-edit/goods-edit` | 获取编辑用商品详情 | `products(*)`, `product_skus(*)` | — | ✅ |
| 11 | `merchantSetStatus` | `pages/merchant/products/products` | 上架/下架商品 | `products(merchantId)` | `products(status)` | ✅ |
| 12 | `merchantDelete` | `pages/merchant/products/products` | 删除商品 | — | `products`, `product_skus`(按productId) | ✅ |

### 2.3 规格模板

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 13 | `listSpecTemplates` | `pages/merchant/goods-edit/goods-edit` | 读取规格模板列表 | `shop_spec_templates(merchantId,name,values)` | — | ✅ |
| 14 | `saveSpecTemplate` | `pages/merchant/goods-edit/goods-edit` | 保存规格模板 | — | `shop_spec_templates(merchantId,name,values)` | ✅ |
| 15 | `removeSpecTemplate` | `pages/merchant/goods-edit/goods-edit` | 删除规格模板 | — | `shop_spec_templates`(删除) | ✅ |

---

## 三、service（服务）

### 3.1 用户端

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 16 | `getList` | `pages/index/index`(首页推荐)、`pages/service/list/list`(服务列表)、`pages/search/search`(搜索) | 浏览/搜索服务 | `services(status='on', name, coverImage, price, rating, merchantId, categoryId)` | — | ✅ |
| 17 | `getDetail` | `pages/service/detail/detail`、`pages/booking/confirm/confirm` | 查看服务详情 | `services(*,含timeTemplate,duration)` | — | ✅ |
| 18 | `getAvailableSlots` | `pages/booking/confirm/confirm` | 查看可选预约时段 | `bookings(serviceId,bookingDate,status)`(冲突检测) | — | ✅ |

### 3.2 商户端

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 19 | `merchantCreate` | `pages/merchant/goods-edit/goods-edit` | 新建服务 | — | `services(name,coverImage,price,timeTemplate,duration,status,...)` | ✅ |
| 20 | `merchantUpdate` | `pages/merchant/goods-edit/goods-edit` | 编辑服务 | `services(_id,merchantId)` | `services(同创建字段)` | ✅ |
| 21 | `merchantGet` | `pages/merchant/goods-edit/goods-edit` | 获取编辑用服务详情 | `services(*)` | — | ✅ |
| 22 | `merchantSetStatus` | `pages/merchant/products/products` | 上架/下架服务 | `services(merchantId)` | `services(status)` | ✅ |

---

## 四、order（订单）

### 4.1 用户侧

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 23 | `createDirect` | `pages/product/detail/detail` → `pages/order/confirm/confirm` | 提交订单(微信支付占位) | `products(_id,price,stock,version)`, `product_skus(stock,version)` | `orders(orderNo,items,totalAmount,status='unpaid',payExpireAt,createTime)` | ✅ |
| 24 | `getMyList` | `pages/order/list/list` | 查看我的订单 | `orders(_openid,status,orderNo,totalAmount,items,createTime)` | — | ✅ |
| 25 | `getDetail` | `pages/order/detail/detail` | 查看订单详情 | `orders(*)`, `merchants(name,avatar)` | `orders(pickupCodeQr)`(懒生成) | ✅ |
| 26 | `cancel` | `pages/order/list/list`、`pages/order/detail/detail` | 取消订单 | `orders(status,items[].productId/qty)` | `orders(status='cancelled',cancelReason,cancelTime)`, `product_skus/stock(+回滚)` | ✅ |
| 27 | `confirmMockPayment` | `utils/payment.js` → 订单详情 | Mock支付成功(仅测试) | — | `orders(paymentStatus='paid',status='pending_prepare')` | ✅ |

### 4.2 商户侧

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 28 | `getMerchantOrders` | `pages/merchant/order/order`、`pages/merchant/dashboard/dashboard` | 订单管理列表+仪表盘 | `orders(merchantId,status,orderNo,totalAmount,items,createTime)` | — | ✅ |
| 29 | `getMerchantOrderDetail` | `pages/merchant/order-detail/detail` | 商户查看订单详情 | `orders(*,含pickupCode,pickupDeadlineAt)` | — | ✅ |
| 30 | `getOrderByPickupCode` | `pages/merchant/verify-order/verify-order` | 扫码/输入核销码查询 | `orders(pickupCode,merchantId,status)` | — | ✅ |
| 31 | `merchantMarkStockReady` | `pages/merchant/order/order` | 备货完成(生成核销码) | — | `orders(status='pending_pickup',pickupReadyTime,pickupDeadlineAt,pickupCode,operationLogs)` | ✅ |
| 32 | `verifyPickup` | `pages/merchant/verify-order/verify-order` | 确认核销 | — | `orders(status='completed',pickupTime,pickupBy,operationLogs)`, `merchant_fund_ledger(bizType='order_income')`, `products(salesCount+1)` | ✅ |
| 33 | `refund` | `pages/merchant/order-detail/detail` | 商户发起退款 | `orders(paymentStatus,refundApplyStatus)` | `orders(refundApplyStatus,refundReason,refundAmount)`, `refund_records` | ✅ |
| 34 | `merchantReviewRefund` | `pages/merchant/order/order` | 审核退款(通过/驳回) | `refund_records`, `orders` | `refund_records(status='approved'/'rejected')`, 通过后调微信退款 | ✅ |
| 35 | `executeRefund` | `pages/merchant/order/order` | 执行退款 | `refund_records`, `orders` | `refund_records(status='processing')`, 调用微信退款API | ✅ |

---

## 五、booking（预约）

### 5.1 用户侧

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 36 | `create` | `pages/booking/confirm/confirm` | 提交预约 | `services(status,timeTemplate,price)`, `bookings`(时段冲突检测) | `bookings(bookingNo,serviceId,serviceName,bookingDate,bookingSlot,price,status='unpaid',payExpireAt,createTime)` | ✅ |
| 37 | `getMyList` | `pages/booking/list/list` | 查看我的预约 | `bookings(_openid,status,bookingNo,serviceName,bookingDate,bookingSlot,createTime)` | — | ✅ |
| 38 | `getDetail` | `pages/booking/detail/detail` | 查看预约详情 | `bookings(*)`, `services(name)`, `merchants(name)` | — | ✅ |
| 39 | `cancel` | `pages/booking/list/list`、`pages/booking/detail/detail` | 取消预约 | `bookings(status,paymentStatus)` | `bookings(status='cancelled',cancelReason,cancelTime)` | ✅ |
| 40 | `confirmMockPayment` | `utils/payment.js` → 预约详情 | Mock支付成功(仅测试) | — | `bookings(paymentStatus='paid',status='pending_confirm')` | ✅ |

### 5.2 商户侧

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 41 | `getMerchantBookings` | `pages/merchant/order/order`、`pages/merchant/dashboard/dashboard` | 预约管理+仪表盘 | `bookings(merchantId,status,bookingNo,serviceName,bookingDate,createTime)` | — | ✅ |
| 42 | `getMerchantBookingDetail` | `pages/merchant/booking-detail/detail` | 商户查看预约详情 | `bookings(*)`, `services`, `users(nickName)` | — | ✅ |
| 43 | `confirm` | `pages/merchant/order/order` | 确认预约 | — | `bookings(status='confirmed',confirmedTime,operationLogs)` | ✅ |
| 44 | `reject` | `pages/merchant/order/order` | 拒绝预约(+退款) | — | `bookings(status='cancelled',rejectReason,operationLogs)`, 调微信退款 | ✅ |
| 45 | `complete` | `pages/merchant/order/order` | 完成预约 | — | `bookings(status='completed',completeTime)`, `merchant_fund_ledger(bizType='booking_income')` | ✅ |
| 46 | `refund` | `pages/merchant/booking-detail/detail` | 商户发起退款 | `bookings(paymentStatus)` | `bookings(refundStatus)`, `refund_records` | ✅ |

---

## 六、review（评价）

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 47 | `getProductReviews` | `pages/product/detail/detail` | 查看商品评价 | `reviews(productId,rating,content,nickName,avatarUrl,createTime)`, `users(nickName,avatarUrl)` | — | ✅(公开) |
| 48 | `getServiceReviews` | `pages/service/detail/detail`、`pages/service/reviews/reviews` | 查看服务评价 | `reviews(serviceId,rating,content,nickName,avatarUrl,createTime)` | — | ✅(公开) |
| 49 | `getReviewSubmitContext` | `pages/review/submit/submit` | 评价页加载 | `orders(status='completed',items)`, `bookings(status='completed')`, `reviews`(是否已评) | — | ✅ |
| 50 | `submitReview` | `pages/review/submit/submit` | 提交评价 | `orders/booking(状态校验)` | `reviews(rating,content,images,bizType,orderId/productId,createTime)`, `products(rating,reviewCount)` / `services(rating,reviewCount)`, `merchants(shopRating,shopReviewCount)` | ✅ |
| 51 | `getMerchantRecent` | `pages/merchant/dashboard/dashboard`、`pages/shop/detail/detail` | 店铺近期评价 | `reviews(merchantId,createTime)` | — | ✅ |
| 52 | `merchantListReviews` | `pages/merchant/reviews/reviews` | 商户评价管理 | `reviews(merchantId)` | — | ✅ |
| 53 | `merchantReplyReview` | `pages/merchant/reviews/reviews` | 商户回复评价 | — | `reviews(merchantReply)` | ✅ |
| 54 | `adminListReviews` | `pages/admin/reviews/reviews` | 管理员评价治理 | `reviews(*)` | — | ✅ |
| 55 | `adminSetReviewHidden` | `pages/admin/reviews/reviews` | 隐藏/恢复评价 | — | `reviews(hiddenFromPublic)` | ✅ |
| 56 | `adminDeleteReview` | `pages/admin/reviews/reviews` | 删除评价 | — | `reviews`(删除) | ✅ |

---

## 七、merchant（商户/店铺）

### 7.1 公开浏览

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 57 | `listForHome` | `pages/index/index`、`pages/shop/browse/browse`、`pages/search/search` | 浏览店铺列表 | `merchants(status='open', name, logo, rating, followerCount)` | — | ✅(公开) |
| 58 | `getById` | `pages/shop/detail/detail`、`pages/product/detail/detail`、`pages/service/detail/detail`、`pages/merchant/dashboard/dashboard` | 查看店铺详情 | `merchants(*,含name,logo,banner,description,pickupPoint,contactPhone,status,shopRating)` | — | ✅(公开) |

### 7.2 关注

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 59 | `followMerchant` | `utils/shop-follow.js` → `pages/shop/detail/detail` | 关注店铺 | — | `merchant_follows(_openid,merchantId)`, `merchants(followerCount+1)` | ✅ |
| 60 | `unfollowMerchant` | `utils/shop-follow.js` → `pages/shop/detail/detail` | 取消关注 | — | `merchant_follows`(删除), `merchants(followerCount-1)` | ✅ |
| 61 | `checkFollow` | `utils/shop-follow.js` | 检查关注状态 | `merchant_follows(_openid,merchantId)` | — | ✅ |
| 62 | `getMyFollowedMerchants` | `pages/profile/follows/follows` | 我的关注列表 | `merchant_follows(_openid)`, `merchants`(联表) | — | ✅ |

### 7.3 商户模式准入

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 63 | `getMyMerchantAccess` | `app.js`(角色切换时)、`pages/merchant/*`(守卫) | 获取可管理店铺列表 | `user_shop_relations(_openid,merchantId)`, `merchants(_id,name,status)` | — | ✅ |
| 64 | `getShopSettings` | `pages/merchant/shop-settings/shop-settings` | 读取店铺设置 | `merchants(settings,businessHours,notice,address,phone)` | — | ✅ |
| 65 | `updateShopSettings` | `pages/merchant/shop-settings/shop-settings` | 更新店铺设置 | — | `merchants(name,description,notice,pickupPoint,contactPhone,logo,banner,...)` | ✅ |

### 7.4 管理员开店

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 66 | `adminCreateAndOpenShop` | `pages/admin/shop-open/shop-open` | 管理员开通店铺 | `merchant_admin_idempotency`(幂等) | `merchants(name,ownerOpenid,status='open',isCertified,...)`, `user_shop_relations`, `users(role='merchant')`, `merchant_admin_logs` | ✅ |
| 67 | `adminListShops` | `pages/admin/shop-open/shop-open` | 店铺列表管理 | `merchants(*)` | — | ✅ |
| 68 | `adminSuspendShop` | `pages/admin/shop-open/shop-open` | 停用店铺 | — | `merchants(status='closed')` | ✅ |
| 69 | `adminResumeShop` | `pages/admin/shop-open/shop-open` | 恢复店铺 | — | `merchants(status='open')` | ✅ |

---

## 八、system（系统配置）

### 8.1 公告

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 70 | `getHomeNotice` | `pages/index/index`、`pages/merchant/dashboard/dashboard`、`utils/notice.js` | 读取平台公告 | `system_settings/home_notice(enabled,notices[])` | — | ✅(公开) |
| 71 | `getMerchantNotice` | `pages/merchant/dashboard/dashboard`、`utils/notice.js` | 读取商户公告 | `system_settings/merchant_notice_{merchantId}(enabled,notices[])` | — | ✅(公开) |
| 72 | `getHomeNoticeAdmin` | `pages/admin/notice/notice` | 管理员读取公告配置 | `system_settings/home_notice` | — | ✅ |
| 73 | `getMerchantNoticeAdmin` | `pages/admin/notice/notice` | 管理员读取商户公告配置 | `system_settings/merchant_notice_{merchantId}` | — | ✅ |
| 74 | `setHomeNotice` | `pages/admin/notice/notice` | 管理员更新平台公告 | — | `system_settings/home_notice(enabled,notices[],updateTime)` | ✅ |
| 75 | `setMerchantNotice` | `pages/admin/notice/notice` | 管理员更新商户公告 | — | `system_settings/merchant_notice_{merchantId}(enabled,notices[],updateTime)` | ✅ |

### 8.2 客服

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 76 | `getContactConfig` | `pages/support/contact/contact` | 用户查看客服信息 | `system_settings/contact(serviceHours,supportWechat,supportEmail)` | — | ✅(公开) |
| 77 | `setContactConfig` | `pages/admin/contact/contact` | 管理员设置客服 | — | `system_settings/contact(serviceHours,supportWechat,supportEmail,updateTime)` | ✅ |

### 8.3 轮播图

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 78 | `getHomeBanners` | `pages/index/index` | 首页轮播 | `banners(imageUrl,title,targetType,targetValue,enabled,startTime,endTime,sortOrder)` | — | ✅(公开) |
| 79 | `adminListBanners` | `pages/admin/banners/banners` | 管理员轮播列表 | `banners(*)` | — | ✅ |
| 80 | `adminUpsertBanner` | `pages/admin/banners/banners` | 管理员新增/编辑轮播 | — | `banners(imageUrl,title,targetType,targetValue,enabled,startTime,endTime,sortOrder)` | ✅ |
| 81 | `adminDeleteBanner` | `pages/admin/banners/banners` | 管理员删除轮播 | — | `banners`(删除) | ✅ |

### 8.4 支付配置

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 82 | `getPayConfig` | `pages/admin/pay-config/pay-config` | 管理员读取支付配置 | `system_settings/pay_config(payMode,appId,serviceProviderMchId,...)` | — | ✅ |
| 83 | `setPayConfig` | `pages/admin/pay-config/pay-config` | 管理员保存支付配置 | — | `system_settings/pay_config(全部支付参数,updateTime)` | ✅ |

---

## 九、finance（财务）

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 84 | `getOverview` | `pages/merchant/finance/finance` | 查看财务概览 | `merchant_wallets(withdrawableBalance)`, `merchant_fund_ledger(amount,direction)`, `merchant_withdrawals(status='pending')` | — | ✅ |
| 85 | `getLedgerList` | `pages/merchant/finance/finance` | 资金流水列表 | `merchant_fund_ledger(merchantId,bizType,amount,occurTime,direction,balance)` | — | ✅ |
| 86 | `applyWithdraw` | `pages/merchant/finance/finance` | 申请提现 | `merchant_fund_ledger`(计算可用余额) | `merchant_withdrawals(merchantId,amount,status='pending',applyTime)` | ✅ |
| 87 | `getWithdrawList` | `pages/merchant/finance/finance` | 提现记录列表 | `merchant_withdrawals(*)` | — | ✅ |
| 88 | `adminListWithdrawals` | `pages/admin/withdrawals/withdrawals` | 管理员查看提现申请 | `merchant_withdrawals(*)` | — | ✅ |
| 89 | `adminApproveWithdrawal` | `pages/admin/withdrawals/withdrawals` | 管理员审批通过 | — | `merchant_withdrawals(status='processing')`, `merchant_fund_ledger(direction='expense')` | ✅ |
| 90 | `adminRejectWithdrawal` | `pages/admin/withdrawals/withdrawals` | 管理员驳回提现 | `merchant_fund_ledger`(冲正) | `merchant_withdrawals(status='rejected')`, `merchant_fund_ledger(direction='reversal')` | ✅ |
| 91 | `adminMarkWithdrawalPaid` | `pages/admin/withdrawals/withdrawals` | 管理员标记已打款 | — | `merchant_withdrawals(status='completed',paidTime)` | ✅ |

---

## 十、im（即时通讯）

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 92 | `createOrGetConversation` | `pages/message/chat/chat`、`pages/product/detail/detail`(联系卖家) | 创建/获取会话 | `conversations(participants)`, `merchants`, `products` | `conversations(participants,productId,orderId,createTime)` | ✅ |
| 93 | `getConversation` | `pages/message/chat/chat` | 获取会话详情 | `conversations(*)` | — | ✅ |
| 94 | `listConversations` | `pages/message/index/index` | 会话列表(含未读) | `conversations(participants,lastMessage,unreadCountMap)` | — | ✅ |
| 95 | `listMerchantConversations` | `pages/merchant/buyer-messages/buyer-messages` | 商户会话列表 | `conversations(merchantId,unreadCountMap)` | — | ✅ |
| 96 | `listMessages` | `pages/message/chat/chat` | 加载消息(latest/older/newer) | `messages(conversationId,content,senderOpenid,type,createTime)` | `conversations(unreadCountMap=0)`(标记已读) | ✅ |
| 97 | `sendMessage` | `pages/message/chat/chat` | 发送消息(text/image) | `conversations(participants)`(校验) | `messages(conversationId,senderOpenid,content,type,createTime)`, `conversations(lastMessage,unreadCountMap+)` | ✅ |
| 98 | `markRead` | `pages/message/chat/chat` | 标记已读 | — | `conversations(unreadCountMap=0)` | ✅ |
| 99 | `getUnreadTotal` | `pages/message/index/index` | 未读总数角标 | `conversations(unreadCountMap)` | — | ✅ |

---

## 十一、favorite（收藏）

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 100 | `toggle` | `utils/favorite.js` → 商品/服务详情页、列表页 | 收藏/取消收藏 | — | `favorites(_openid,itemId,itemType)`(toggle) | ✅ |
| 101 | `check` | `utils/favorite.js` → 商品/服务详情页、列表页 | 检查是否已收藏 | `favorites(_openid,itemId)` | — | ✅ |
| 102 | `list` | `utils/favorite.js` → `pages/profile/favorites/favorites`、`pages/profile/index/index` | 收藏列表 | `favorites(_openid)` | — | ✅ |

---

## 十二、payment（支付回调）

| # | action | 调用页面 | 用户动作 | 读取集合(关键字段) | 写入集合(关键字段) | 状态 |
|---|---|---|---|---|---|---|
| 103 | `handleWechatPayNotify` | 微信回调(无前端页面) | 微信支付结果通知 | `payment_transactions(outTradeNo)`(幂等) | `payment_transactions`, 分发到 `order.handlePayNotify` / `booking.handlePayNotify` | ✅ |

---

## 十三、定时任务（非前端调用）

| # | action | 云函数 | 触发方式 | 读取集合 | 写入集合 | 状态 |
|---|---|---|---|---|---|---|
| 104 | `cancelUnpaid` | `booking-timeout` | 定时触发器(30min) | `bookings(status='unpaid',payExpireAt)` | `bookings(status='cancelled')` | ✅ |
| 105 | `cancelPendingConfirm` | `booking-timeout` | 定时触发器(24h) | `bookings(status='pending_confirm',paidTime)` | `bookings(status='cancelled')` | ✅ |
| 106 | `cancelUnpaid` | `order-timeout` | 定时触发器(30min) | `orders(status='unpaid',payExpireAt)` | `orders(status='cancelled')` | ✅ |
| 107 | `markPendingPickupOverdue` | `order-timeout` | 定时触发器(24h) | `orders(status='pending_pickup',pickupDeadlineAt)` | `orders(pickupOverdue=true)` | ✅ |
| 108 | `autoRefundOverduePickup` | `order-timeout` | 可选(dryRun缺省) | `orders(status='pending_pickup',paymentStatus='paid',pickupOverdue)` | `orders`(调用order.systemRefundOverduePickup) | ✅ |

---

## 十四、bootstrap（初始化脚本）

| # | action | 说明 | 写入集合 | 状态 |
|---|---|---|---|---|
| 109 | `checkCollections` | 检查核心集合存在性 | — | ✅ |
| 110 | `initProductDemo` / `clearProductDemo` | 演示商品初始化/清理 | `products` | ✅ |
| 111 | `initServiceDemo` / `clearServiceDemo` | 演示服务初始化/清理 | `services` | ✅ |
| 112 | `initHomeNoticeConfig` | 初始化平台公告 | `system_settings/home_notice` | ✅ |
| 113 | `initMerchantNoticeConfig` | 初始化商户公告 | `system_settings/merchant_notice_{id}` | ✅ |
| 114 | `initSystemConfig` | 初始化订单规则配置 | `system_settings/order_biz_rules` | ✅ |
| 115 | `migrateUserShopRelationsFromOwners` | 迁移店主关系到关系表 | `user_shop_relations` | ✅ |

---

## 附录A：完整数据集合总览（24个）

| 集合 | 核心读写云函数 | 用途 |
|---|---|---|
| `users` | auth, system, booking, merchant | 用户身份与角色 |
| `merchants` | merchant, auth, product, booking, review | 商户/店铺 |
| `products` | product, review, inventory | 商品 |
| `product_skus` | product, inventory | 商品SKU多规格 |
| `shop_spec_templates` | product | 规格模板 |
| `services` | service, booking, review, product | 服务 |
| `orders` | order, review, refund, order-timeout, finance | 订单全生命周期 |
| `bookings` | booking, review, booking-timeout, finance | 预约全生命周期 |
| `reviews` | review | 用户评价 |
| `user_shop_relations` | merchant, auth, bootstrap | 用户-店铺绑定 |
| `merchant_follows` | merchant | 用户关注店铺 |
| `merchant_applications` | merchant | 入驻申请（已下线，保留集合） |
| `payment_transactions` | order, booking, payment | 支付交易凭证 |
| `payment_refunds` | order, booking, payment | 退款凭证 |
| `merchant_wallets` | finance | 商户钱包余额 |
| `merchant_fund_ledger` | finance | 资金流水台账 |
| `merchant_withdrawals` | finance | 提现申请单 |
| `system_settings` | system, order, booking, bootstrap | 系统配置(公告/客服/支付/订单规则) |
| `banners` | system, getHomeBanners, bootstrap | 首页轮播图 |
| `conversations` | im | IM会话 |
| `messages` | im | IM消息 |
| `merchant_admin_logs` | merchant | 管理员操作审计 |
| `merchant_admin_idempotency` | merchant | 管理员幂等键 |
| `inventory_change_logs` | inventory | 库存变更日志(备用) |
| `system_alerts` | inventory | 系统预警(备用) |

---

## 附录B：前端页面 → 云函数调用快速索引

| 页面路径 | 调用的云函数 |
|---|---|
| `pages/index/index`(首页) | `system.getHomeBanners`, `product.getList`, `service.getList`, `merchant.listForHome`, `system.getHomeNotice` |
| `pages/product/list/list`(商品列表) | `product.getList` |
| `pages/product/detail/detail`(商品详情) | `product.getDetail`, `review.getProductReviews`, `merchant.getById`, `favorite.toggle/check`, `im.createOrGetConversation` |
| `pages/service/list/list`(服务列表) | `service.getList` |
| `pages/service/detail/detail`(服务详情) | `service.getDetail`, `review.getServiceReviews`, `merchant.getById`, `favorite.toggle/check` |
| `pages/service/reviews/reviews`(服务评价) | `review.getServiceReviews` |
| `pages/shop/detail/detail`(店铺主页) | `merchant.getById`, `product.getList`, `review.getMerchantRecent`, `favorite`, `merchant.follow/unfollow/check`, `system.getMerchantNotice` |
| `pages/shop/browse/browse`(逛店铺) | `merchant.listForHome` |
| `pages/search/search`(搜索) | `product.getList`, `service.getList`, `merchant.listForHome` |
| `pages/booking/confirm/confirm`(预约确认) | `service.getDetail`, `service.getAvailableSlots`, `booking.create` |
| `pages/booking/list/list`(我的预约) | `booking.getMyList` |
| `pages/booking/detail/detail`(预约详情) | `booking.getDetail`, `booking.cancel`, `booking.confirmMockPayment` |
| `pages/order/confirm/confirm`(订单确认) | `order.createDirect` |
| `pages/order/list/list`(我的订单) | `order.getMyList`, `order.cancel` |
| `pages/order/detail/detail`(订单详情) | `order.getDetail`, `order.cancel`, `order.confirmMockPayment` |
| `pages/review/submit/submit`(提交评价) | `review.getReviewSubmitContext`, `review.submitReview` |
| `pages/message/index/index`(消息列表) | `im.listConversations`, `im.getUnreadTotal` |
| `pages/message/chat/chat`(聊天) | `im.createOrGetConversation`, `im.getConversation`, `im.listMessages`, `im.sendMessage`, `im.markRead` |
| `pages/profile/index/index`(个人中心) | `favorite.list` |
| `pages/profile/favorites/favorites`(收藏) | `favorite.list`, `favorite.toggle` |
| `pages/profile/follows/follows`(关注) | `merchant.getMyFollowedMerchants` |
| `pages/merchant/dashboard/dashboard`(商户工作台) | `order.getMerchantOrders`, `booking.getMerchantBookings`, `system.getHomeNotice/MerchantNotice`, `merchant.getById`, `review.getMerchantRecent`, `product.getList` |
| `pages/merchant/order/order`(订单管理) | `order.getMerchantOrders`, `booking.getMerchantBookings`, `order.merchantMarkStockReady`, `booking.confirm/reject/complete`, `order.merchantReviewRefund/executeRefund` |
| `pages/merchant/order-detail/detail`(订单详情商户) | `order.getMerchantOrderDetail`, `order.refund` |
| `pages/merchant/booking-detail/detail`(预约详情商户) | `booking.getMerchantBookingDetail`, `booking.refund` |
| `pages/merchant/verify-order/verify-order`(核销) | `order.getOrderByPickupCode`, `order.verifyPickup` |
| `pages/merchant/goods-edit/goods-edit`(商品/服务编辑) | `product.merchantGet/Create/Update`, `service.merchantGet/Create/Update`, `product.listSpecTemplates/saveSpecTemplate` |
| `pages/merchant/products/products`(商品管理列表) | `product.getMerchantMerged`, `product.merchantSetStatus`, `product.merchantDelete` |
| `pages/merchant/reviews/reviews`(评价管理) | `review.merchantListReviews`, `review.merchantReplyReview` |
| `pages/merchant/finance/finance`(财务) | `finance.getOverview`, `finance.getLedgerList`, `finance.applyWithdraw`, `finance.getWithdrawList` |
| `pages/merchant/buyer-messages/buyer-messages`(买家消息) | `im.listMerchantConversations` |
| `pages/merchant/shop-settings/shop-settings`(店铺设置) | `merchant.getShopSettings`, `merchant.updateShopSettings` |
| `pages/admin/dashboard/dashboard`(管理员主页) | —(仅导航) |
| `pages/admin/notice/notice`(公告配置) | `system.getHomeNoticeAdmin/MerchantNoticeAdmin`, `system.setHomeNotice/setMerchantNotice` |
| `pages/admin/banners/banners`(轮播管理) | `system.adminListBanners`, `system.adminUpsertBanner`, `system.adminDeleteBanner` |
| `pages/admin/contact/contact`(客服配置) | `system.getContactConfig`, `system.setContactConfig` |
| `pages/admin/pay-config/pay-config`(支付配置) | `system.getPayConfig`, `system.setPayConfig` |
| `pages/admin/reviews/reviews`(评价治理) | `review.adminListReviews`, `review.adminSetReviewHidden`, `review.adminDeleteReview` |
| `pages/admin/shop-open/shop-open`(开店) | `merchant.adminCreateAndOpenShop`, `merchant.adminListShops`, `merchant.adminSuspendShop/adminResumeShop` |
| `pages/admin/withdrawals/withdrawals`(提现管理) | `finance.adminListWithdrawals`, `finance.adminApproveWithdrawal/adminReject/adminMarkPaid` |
| `pages/support/contact/contact`(联系客服) | `system.getContactConfig` |

---

## 附录C：已下线/暂停开发项（不纳入基线）

| 项目 | 云函数/页面 | 状态 |
|---|---|---|
| 线上入驻申请 | `merchant.apply/getMyApplication/review/getApplyList` | ❌ 已下线 |
| 创业资讯 | `pages/news/list/list` | ⏸️ 暂停开发 |
| 创客风采 | `pages/service/list/list`(部分) | ⏸️ 暂停开发 |
| 配送链路 | 地址管理接入下单 | ❌ 学校不支持配送 |
| 消息Mock | `utils/message-mock.js` | ⚠️ 待替换为真实IM |
| 店铺关注(数据落库) | `merchant_follows` | ⚠️ 后端已就绪，前端店铺主页未全量接入 |

---

*本文档基于 `cloud/functions/*/index.js` + `miniprogram/pages/**/*.js` + `miniprogram/utils/*.js` 逐行提取，与 2026-04-28 代码状态完全对齐。*
