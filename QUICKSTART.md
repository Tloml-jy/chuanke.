﻿﻿﻿# 环院创客帮 - 项目速读文档

> 快速了解项目结构、启动方式、构建流程和关键页面

---

## 📁 项目结构概览

```
chuanke/
├── miniprogram/              # 小程序前端代码
│   ├── pages/               # 页面目录（20+页面）
│   ├── components/          # 自定义组件
│   ├── utils/               # 工具函数
│   ├── assets/              # 静态资源
│   ├── custom-tab-bar/      # 自定义TabBar
│   ├── app.js               # 小程序入口
│   ├── app.json             # 全局配置
│   └── app.wxss             # 全局样式
│
├── cloud/                   # 云开发相关
│   ├── functions/           # 云函数（9个）
│   │   ├── auth/            # 认证授权
│   │   ├── product/         # 商品管理
│   │   ├── service/         # 服务管理
│   │   ├── merchant/        # 商户管理
│   │   ├── order/           # 订单管理
│   │   ├── booking/         # 预约管理
│   │   ├── im/              # 即时通讯
│   │   ├── review/          # 评价系统
│   │   └── bootstrap/       # 初始化引导
│   └── database/            # 数据库脚本
│
├── scripts/                 # 辅助脚本
├── tests/                   # 测试文件
└── *.md                     # 项目文档
```

---

## 🚀 快速启动

### 前置要求

1. **微信开发者工具**（最新版）
2. **Node.js** >= 14.x
3. **微信小程序AppID**: `wx161f48213db79b00`

### 启动步骤

#### 1. 安装依赖

```bash
# 小程序前端依赖
cd miniprogram
npm install

# 云函数依赖（每个云函数单独安装）
cd ../cloud/functions/auth
npm install

cd ../product && npm install
cd ../service && npm install
# ... 其他云函数同理
```

#### 2. 打开项目

- 使用**微信开发者工具**打开项目根目录
- 选择"小程序"项目类型
- AppID: `wx161f48213db79b00`
- 项目目录: `c:\Users\30994\Desktop\chuanke`

#### 3. 编译运行

- 点击工具栏"编译"按钮
- 或使用快捷键 `Ctrl+B` (Windows) / `Cmd+B` (Mac)

---

## 🔨 构建与部署

### 小程序前端

微信开发者工具会自动处理：
- WXML/WXSS 编译
- JavaScript 转译（ES6+）
- 代码压缩与混淆
- NPM 包构建

**手动构建NPM：**
```
工具 -> 构建 npm
```

### 云函数部署

在微信开发者工具中：
1. 右键点击云函数目录
2. 选择"上传并部署：云端安装依赖"
3. 等待部署完成

或命令行部署：
```bash
# 以auth云函数为例
cd cloud/functions/auth
npm install
# 在开发者工具中右键上传
```

---

## 📱 核心页面说明

### 用户端页面

| 页面路径 | 功能说明 | 关键文件 |
|---------|---------|---------|
| `/pages/index/index` | 首页（公告+轮播+推荐） | index.js/wxml/wxss |
| `/pages/mall/mall` | 商城列表页 | mall.js/wxml/wxss |
| `/pages/news/news` | 资讯列表页 | news.js/wxml/wxss |
| `/pages/talent/talent` | 创客风采页 | talent.js/wxml/wxss |
| `/pages/product/detail` | 商品详情页 | detail.js/wxml/wxss |
| `/pages/service/detail` | 服务详情页 | detail.js/wxml/wxss |
| `/pages/order/list` | 订单列表页 | list.js/wxml/wxss |
| `/pages/booking/list` | 预约列表页 | list.js/wxml/wxss |
| `/pages/message/message` | 消息中心 | message.js/wxml/wxss |
| `/pages/profile/profile` | 个人中心 | profile.js/wxml/wxss |

### 商户端页面

| 页面路径 | 功能说明 |
|---------|---------|
| `/pages/merchant/dashboard` | 商户工作台 |
| `/pages/merchant/orders` | 订单管理（核销） |
| `/pages/merchant/bookings` | 预约管理（确认） |
| `/pages/merchant/products` | 商品管理 |
| `/pages/merchant/services` | 服务管理 |

---

## ⚡ 云函数接口清单

### auth - 认证授权
- `login` - 用户登录
- `getUserInfo` - 获取用户信息
- `updateUserInfo` - 更新用户信息
- `switchRole` - 切换角色（用户/商户）

### product - 商品管理
- `getList` - 获取商品列表
- `getDetail` - 获取商品详情
- `create` - 创建商品（商户）
- `update` - 更新商品（商户）
- `delete` - 删除商品（商户）

### service - 服务管理
- `getList` - 获取服务列表
- `getDetail` - 获取服务详情
- `create` - 创建服务（商户）
- `update` - 更新服务（商户）
- `delete` - 删除服务（商户）

### merchant - 商户管理
- `listForHome` - 首页店铺列表
- `apply` - 申请入驻
- `getInfo` - 获取商户信息
- `approve` - 审核通过（管理员）

### order - 订单管理
- `create` - 创建订单
- `pay` - 支付订单
- `cancel` - 取消订单
- `confirmPickup` - 确认自提（商户核销）
- `getList` - 获取订单列表

### booking - 预约管理
- `create` - 创建预约
- `cancel` - 取消预约
- `confirm` - 确认预约（商户）
- `reject` - 拒绝预约（商户）
- `getList` - 获取预约列表

### im - 即时通讯
- `sendMessage` - 发送消息
- `getHistory` - 获取聊天记录
- `getUnreadCount` - 获取未读数

### review - 评价系统
- `create` - 提交评价
- `getList` - 获取评价列表
- `getStats` - 获取评价统计

### system - 系统配置
- `getHomeBanners` - 获取轮播图
- `getHomeNotice` - 获取首页公告

---

## 💾 核心数据库集合

| 集合名 | 说明 | 关键字段 |
|-------|------|---------|
| `users` | 用户信息 | openid, role, avatarUrl |
| `merchants` | 商户信息 | userId, status, approvedAt |
| `products` | 商品信息 | merchantId, status, price |
| `services` | 服务信息 | merchantId, status, duration |
| `orders` | 订单信息 | userId, productId, status |
| `bookings` | 预约信息 | userId, serviceId, status |
| `messages` | 消息记录 | fromUserId, toUserId, content |
| `reviews` | 评价记录 | targetId, rating, content |
| `banners` | 轮播图配置 | imageUrl, linkUrl, sortOrder |
| `system_settings` | 系统配置 | home_notice |

---

## 🔧 常用工具函数

### 位置：`miniprogram/utils/`

| 文件 | 功能 |
|-----|------|
| `request.js` | 云函数调用封装（含重试、性能日志） |
| `auth.js` | 权限检查、角色判断 |
| `format.js` | 日期格式化、价格格式化 |
| `validator.js` | 表单验证 |
| `message-badge.js` | 消息角标同步 |

### 云函数调用示例

```javascript
const { call } = require('../../utils/request')

// 调用云函数
const res = await call('product', {
  action: 'getList',
  page: 1,
  pageSize: 10
})

if (res.code === 0) {
  console.log(res.data)
}
```

---

## 🎨 UI设计规范

### 设计Token（app.wxss）

```css
/* 颜色 */
--primary-color: #FF6B35;     /* 主题橙色 */
--success-color: #52C41A;     /* 成功绿色 */
--warning-color: #FAAD14;     /* 警告黄色 */
--error-color: #FF4D4F;       /* 错误红色 */

/* 背景色 */
--bg-color: #F5F5F5;          /* 页面背景 */
--card-bg: #FFFFFF;           /* 卡片背景 */

/* 圆角 */
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;

/* 阴影 */
--shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
--shadow-md: 0 2px 8px rgba(0,0,0,0.1);
```

### 组件规范

- 卡片式设计：白色背景 + 轻微阴影
- 列表项：底部边框分隔
- 按钮：主按钮用主题色，次要按钮用描边
- 文本层级：标题16px加粗，正文14px，辅助12px

---

## ⚠️ 已知性能问题

详见项目根目录的性能优化建议：

1. **首页加载慢** - 店铺列表全量拉取200条
2. **服务N+1查询** - 预约统计逐个查询
3. **缺少前端缓存** - 仅公告有缓存

---

## 📚 详细文档

- `SKILL.md` - AI开发助手主文档
- `project-architecture.md` - 项目架构详解
- `database-design.md` - 数据库设计
- `cloud-functions.md` - 云函数接口文档
- `business-flows.md` - 业务流程说明
- `development-guide.md` - 开发规范

---

## 🆘 常见问题

### Q: 如何添加新页面？

1. 在 `miniprogram/pages/` 创建页面目录
2. 右键 -> 新建Page，自动生成4个文件
3. 在 `app.json` 的 `pages` 数组中添加路径
4. 如需TabBar，在 `tabBar.list` 中配置

### Q: 如何调试云函数？

1. 在云函数目录右键 -> "本地调试"
2. 或在开发者工具"云开发"控制台中查看日志
3. 使用 `console.log` 输出调试信息

### Q: 如何切换环境？

修改 `project.config.json` 中的 `appid` 和云环境ID。

### Q: 数据在哪里查看？

微信开发者工具 -> 云开发控制台 -> 数据库

---

## 📞 技术支持

- 项目文档齐全，优先查阅对应 `.md` 文件
- 云函数按action组织，搜索action名称定位代码
- 页面逻辑清晰，遵循标准小程序生命周期

---

**最后更新**: 2026-04-28
**项目版本**: v1.0
**技术栈**: 微信小程序 + 云开发 + Node.js
