# 项目架构设计（2026-04 对齐版）

> 本文档为当前代码实现的架构基线，优先级高于历史描述。  
> 覆盖范围：小程序端 + 云函数端。

---

## 1. 技术栈与运行边界

- 小程序前端：微信小程序原生（WXML/WXSS/JS）
- 云端后端：腾讯云开发 Cloud Functions（Node.js）+ 云数据库
- 通信方式：统一通过 `miniprogram/utils/request.js` 调用 `wx.cloud.callFunction`
- UI 体系：原生组件 + Vant Weapp（按页面按需接入）

---

## 2. 当前目录与模块职责

```text
chuanke/
├─ miniprogram/
│  ├─ app.json                # 页面路由与 tabBar
│  ├─ app.wxss                # 全局设计 token
│  ├─ pages/
│  │  ├─ index/               # 首页
│  │  ├─ product/             # 商品列表/详情
│  │  ├─ service/             # 创客服务列表/详情
│  │  ├─ shop/detail/         # 店铺主页（新UI）
│  │  ├─ order/               # 订单确认/列表/详情
│  │  ├─ booking/             # 预约列表/详情/确认
│  │  ├─ message/             # 消息列表/会话
│  │  ├─ profile/             # 我的/收藏/地址
│  │  ├─ merchant/            # 商户端工作台/订单/预约/核销/财务
│  │  └─ admin/               # 管理员公告/店铺开通/客服配置
│  └─ utils/
│     ├─ request.js           # 云函数调用封装
│     ├─ price.js             # 分转元
│     ├─ notice.js            # 公告归一化
│     ├─ favorite.js          # 收藏本地逻辑
│     └─ message-mock.js      # 消息 mock（待替换）
└─ cloud/functions/
   ├─ product/                # 商品读接口
   ├─ service/                # 服务读接口 + 可约时段
   ├─ order/                  # 订单链路 + 核销
   ├─ booking/                # 预约链路
   ├─ payment/                # 统一支付回调入口与业务分发
   ├─ merchant/               # 店铺资料/关注/商户准入/管理员开通店铺（线上入驻申请已下线）
   ├─ system/                 # 公告与客服配置
   ├─ booking-timeout/        # 定时取消任务
   ├─ finance/                # 财务与提现（商户+管理员）
   ├─ review/                 # 评价（提交/列表/治理/回复）
   ├─ im/                     # 消息/会话/未读（IM）
   └─ bootstrap/              # 初始化脚本
```

---

## 3. 角色模型与权限边界

### 3.1 角色

- `user`：浏览、下单、预约、查看个人订单/预约
- `merchant`：处理本商户订单/预约、执行核销
- `admin`：公告管理、店铺开通、客服配置维护

### 3.2 权限原则

- **前端可见性不等于权限**：最终权限以云函数参数校验 + 数据归属校验为准。
- 订单侧关键校验：
  - 用户只能取消/查看自己的订单（按 `_openid`）
  - 商户只能查看/核销自己商户的订单（按 `merchantId`）
- 预约侧关键校验：
  - 用户只能取消/查看自己的预约
  - 商户只能确认/拒绝/完成自己商户的预约

---

## 4. 核心业务闭环（现网实现）

### 4.1 商品订单闭环（到店自提）

1. 商品详情页发起下单（`order.createDirect`）
2. 云端校验商品状态与库存，创建订单（默认生成核销码）
3. 订单进入 `pending_pickup`
4. 商户在核销页输入/扫码核销码，调用 `order.verifyPickup`
5. 订单变更为 `completed`，写入核销时间与操作日志

### 4.2 服务预约闭环

1. 用户在服务详情确认时段并创建预约（`booking.create`）
2. 状态进入 `unpaid`（或线下支付场景直接 `pending_confirm`）
3. 商户确认预约（`booking.confirm`）-> `confirmed`
4. 商户标记完成（`booking.complete`）-> `completed`

### 4.3 商户开通闭环

1. 用户线下提交入驻材料
2. 管理员后台直接创建/上架店铺（写入 `merchants`）
3. 用户切换商户模式时通过 `merchant.getMyMerchantAccess` 判定可进入

### 4.4 商户财务 P0

1. 商户端通过 `finance.getOverview` 查看钱包概览
2. 商户端通过 `finance.getLedgerList` 查看 `merchant_fund_ledger` 资金流水
3. 订单核销完成、预约完成后自动入账到 `merchant_wallets`
4. 当前仍是申请提现模式，不做自动打款

### 4.5 当前强约束

1. 学校不支持配送，订单链路固定“到店自提”
2. 联系客服功能保持稳定，不在本轮改造范围
3. 创业资讯、创客风采处于暂停开发阶段（点击提示中）

### 4.6 支付接入当前分层

1. `system` 负责维护支付配置与 readiness
2. `order` / `booking` 负责业务单创建、状态流转、退款
3. `payment_transactions` / `payment_refunds` 作为统一支付凭证层
4. `payment.handleWechatPayNotify` 作为统一支付通知入口，按支付单分发到订单或预约

---

## 5. 状态机（当前代码）

### 5.1 订单状态

- `pending_pickup` -> `completed`
- `unpaid` -> `pending_prepare`
- `unpaid | pending_pickup` -> `cancelled`

> 说明：当前代码已具备支付单、统一支付通知入口、真实微信支付 HTTP 请求、回调验签与解密能力；待完成的主要是证书文件部署、正式参数填写与联调验收。

### 5.2 预约状态

- `unpaid` -> `pending_confirm`
- `pending_confirm` -> `confirmed` -> `completed`
- `unpaid | pending_confirm` -> `cancelled`

### 5.3 商户申请状态

- `pending` -> `approved`
- `pending` -> `rejected`

---

## 6. AI 开发时的文档读取顺序（强制建议）

1. `README.md`（总览 + 当前迭代记录 + 未开发清单）
2. `cloud-functions.md`（真实接口与参数/状态约束）
3. `business-flows.md`（流程图与异常分支，若存在）
4. `database-design.md`（字段语义与索引建议）
5. 再进入页面/云函数代码实现

---

## 7. 已知非闭环区域（需持续清零）

- 消息模块仍为 `message-mock` 数据
- 资讯页与部分创客推荐区仍有静态数据
- 店铺关注能力未落库存储
- 首页店铺“服务”tab 仍是占位文案

---

*更新日期：2026-04-10*  
*维护原则：文档必须与代码实现对齐，发现漂移即修订。*