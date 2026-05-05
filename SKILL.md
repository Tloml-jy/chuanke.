---

## name: huanyuan-maker-miniprogram
description: 开发“环院创客帮”微信小程序的完整指南（以当前仓库代码实现为准）。包含项目架构、数据库设计、云函数接口清单、核心业务流程、开发规范等。采用微信云开发（TCB：云函数/云数据库）架构，支持实物商品交易（到店自提核销）与虚拟服务预约（商户确认/完成）。注意：当前版本不支持配送；线上入驻申请已下线，改为线下申请+管理员开通店铺。

# 环院创客帮 - 微信小程序全栈开发指南

## 📋 快速导航

本 Skill 包含以下核心文档：

- **[项目架构](./project-architecture.md)** - 技术选型、目录结构、角色权限
- **[数据库设计](./database-design.md)** - 数据集合字段定义与索引建议（实现对齐版）
- **[云函数接口](./cloud-functions.md)** - 云函数 action 清单与入参/出参（实现对齐版）
- **[业务流程](./business-flows.md)** - 下单、预约、支付、核销、评价、商户开通等核心流程（实现对齐版）
- **[开发规范](./development-guide.md)** - 代码规范、错误处理、性能优化

## 项目概述

"环院创客帮"是一个校园电商小程序，连接学生用户与校内认证商户，支持实物商品交易与虚拟服务预约，当前履约方式为**到店自提**（不支持配送）。

**技术架构**：微信小程序原生 + 云开发（TCB）
**核心功能**：商品浏览、下单支付、服务预约、商户管理、公告/轮播图、评价、消息（IM）、财务提现
**目标用户**：高校师生（买家）、校园创客（商户）、平台运营（管理员）

---

## 🚀 快速开始（给 AI 的指令示例）

### 场景 1：从零开始创建页面

```
帮我创建商品列表页 pages/product/list，需要：
1. 顶部搜索栏 + 分类筛选
2. 商品卡片列表（使用 goods-card 组件）
3. 下拉刷新 + 上拉加载
4. 空状态提示
参考 database-design.md 的 products 表结构和 cloud-functions.md 的 product/getList 接口
```

### 场景 2：实现云函数

```
帮我实现云函数 product 的 getList action，需要：
1. 支持 categoryId、merchantId、keyword 筛选
2. 支持 sort 排序（sales/price_asc/price_desc/newest/rating）
3. 分页返回，每页10条
4. 只返回 status=on 的商品
参考 database-design.md 的 products 表索引设计
```

### 场景 3：修复 Bug

```
订单创建后库存没有扣减，检查 order/create 云函数的事务逻辑
参考 business-flows.md 的"流程一：商品购买流程"
```

### 场景 4：优化性能

```
商品列表页滚动卡顿，如何优化？
参考 development-guide.md 的"性能优化规范"
```

---

## 📚 文档使用指南

### 何时查阅哪个文档？


| 场景       | 查阅文档                    | 说明           |
| -------- | ----------------------- | ------------ |
| 创建新页面/组件 | project-architecture.md | 查看目录结构、路由配置  |
| 设计数据库字段  | database-design.md      | 查看表结构、索引策略   |
| 调用云函数    | cloud-functions.md      | 查看接口入参出参、错误码 |
| 理解业务流程   | business-flows.md       | 查看状态机、异常处理   |
| 代码规范/优化  | development-guide.md    | 查看最佳实践、常见问题  |


### AI 开发工作流

```
1. 明确需求 → 确定要开发的功能模块
2. 查阅文档 → 找到相关的表结构、接口定义
3. 生成代码 → AI 根据文档生成符合规范的代码
4. 测试验证 → 按照业务流程图的步骤测试
5. 优化调整 → 参考开发规范进行优化
```

## 设计规范

### 视觉风格

- **主色调**：蓝色系 `#4A90E2`（活力与信任）
- **辅助色**：白色 `#FFFFFF`、浅灰 `#F5F5F5`
- **风格**：清新、简洁的校园风
- **遵循**：微信小程序官方设计规范

### 布局原则

- 底部常驻导航栏（当前为 4 个 Tab：首页/商城/消息/我的，自定义 tabBar）
- 信息层级清晰，重要操作突出
- 关键元素：店铺认证标识、用户评价、到店自提说明

## 技术栈

### 基础框架

- **框架**：微信小程序原生框架 或 Taro/Uni-app（跨端）
- **语言**：JavaScript/TypeScript + WXML + WXSS
- **状态管理**：全局数据管理（app.globalData）或 Vuex/Redux

### 推荐组件库

- Vant Weapp（轻量、美观）
- 或 MinUI、WeUI

## 核心页面结构（与当前路由对齐）

### 1. 首页 (`pages/index/index`)

**功能要点**：

- 顶部搜索栏 + 消息通知图标
- 轮播图（活动/公告）
- 双分类导航：
  - "按品类找"：图标网格（文创、百货、餐饮、技术服务、学习用品...）
  - "按店铺逛"：横向滚动店铺卡片
- 商品推荐瀑布流
- 底部导航：首页、商城、消息、我的

**代码规范**：

```javascript
// 分类数据结构
const categories = [
  { id: 1, name: '文创', icon: '/images/icon-wenchuang.png' },
  { id: 2, name: '百货', icon: '/images/icon-baihuo.png' },
  // ...
]

// 店铺卡片数据
const shops = [
  { 
    id: 1, 
    name: 'XX文创店', 
    logo: '/images/shop1.png',
    rating: 4.8 
  }
]
```

### 2. 商品/服务列表页 (pages/list/list)

**功能要点**：

- 顶部：返回 + 标题 + 排序筛选（综合/销量/价格）
- 商品卡片：图片、名称、价格、店铺名、销量、评分
- **虚拟服务标识**：角标或标签显示"服务"

**数据区分**：

```javascript
// 商品类型枚举
const PRODUCT_TYPE = {
  PHYSICAL: 'physical',  // 实物
  SERVICE: 'service'     // 虚拟服务
}

// 商品数据结构
{
  id: 1,
  name: '定制文化衫',
  type: PRODUCT_TYPE.PHYSICAL,
  price: 59.9,
  shopName: 'XX文创',
  sales: 128,
  rating: 4.9,
  image: '/images/product1.jpg'
}
```

### 3. 商品/服务详情页 (pages/detail/detail) ⭐关键页面

**功能要点**：

- 图片轮播
- 商品信息：名称、价格
- **店铺信息栏**：头像、名称、**"官方认证"标识**、评分
- **类型差异化展示**：
  - 实物：规格选择（颜色/尺寸）、库存
  - 服务：预约时间选择器、服务时长、需求描述文本框
- 商品详情图文
- 评价预览
- 底部操作栏：客服、加购物车、立即购买

**核心逻辑**：

```javascript
// 根据商品类型渲染不同表单
renderProductForm() {
  if (this.data.product.type === PRODUCT_TYPE.SERVICE) {
    return this.renderServiceForm()  // 时间选择 + 需求描述
  } else {
    return this.renderPhysicalForm() // 规格选择 + 库存
  }
}

// 购买前的验证
handleBuyNow() {
  if (this.data.product.type === PRODUCT_TYPE.SERVICE) {
    if (!this.data.selectedTime) {
      wx.showToast({ title: '请选择预约时间', icon: 'none' })
      return
    }
  }
  // 跳转订单确认页
}
```

### 4. 订单确认页 (`pages/order/confirm/confirm`) ⭐核心交互

**功能要点**：

- **履约方式**：
  - 当前固定为到店自提（不展示配送入口）
- 商品信息（含规格/预约时间）
- 订单备注
- 金额汇总（商品小计 + 配送费 = 实付）
- 提交订单按钮

**核心交互逻辑**：

```javascript
// 履约方式切换
onDeliveryTypeChange(e) {
  const type = e.detail.value  // 'pickup' 或 'delivery'
  this.setData({
    deliveryType: type,
    // 动态更新相关信息
    deliveryFee: type === 'delivery' ? 3 : 0,
    estimatedTime: type === 'delivery' ? '30分钟内' : '今日16:00后可取'
  })
  this.calculateTotal()
}

// 计算总金额
calculateTotal() {
  const total = this.data.productPrice + this.data.deliveryFee
  this.setData({ totalAmount: total })
}
```

**数据结构**：

```javascript
{
  deliveryType: 'pickup',  // 当前仅支持 pickup
  pickupInfo: {
    address: 'XX楼101室',
    availableTime: '今日16:00-18:00'
  },
  deliveryInfo: {
    fee: 3,
    estimatedTime: '30分钟内',
    address: 'XX宿舍楼XXX'
  }
}
```

### 5. 个人中心页 (`pages/profile/index/index`)

**功能要点**：

- 用户信息：头像、昵称、登录状态
- 功能入口：我的订单、地址管理、收藏、客服
- 订单列表：按状态分类（待付款/待自提/待收货/已完成）
- 订单操作：再来一单、评价

**订单状态枚举**：

```javascript
const ORDER_STATUS = {
  PENDING_PAYMENT: 0,   // 待付款
  PENDING_PICKUP: 1,    // 待自提
  // 当前不支持配送相关状态
  COMPLETED: 3,         // 已完成
  CANCELLED: 4          // 已取消
}
```

## 商户后台管理端（Web端）

### 技术建议

- **框架**：Vue 3 + Element Plus 或 React + Ant Design
- **路由**：Vue Router / React Router
- **请求**：Axios

### 核心模块

1. **数据概览**：今日订单数、销售额卡片
2. **商品/服务管理**：
  - 列表：上架/下架/编辑/删除
  - **编辑时区分类型**：实物 vs 服务（不同字段）
3. **订单管理**：状态筛选、接单、发货/完成
4. **评价管理**：查看和回复
5. **店铺设置**：Logo、公告、自提地址

## 开发最佳实践

### 1. 代码组织

```
miniprogram/
├── pages/           # 页面
│   ├── home/
│   ├── list/
│   ├── detail/
│   ├── order-confirm/
│   └── mine/
├── components/      # 公共组件
│   ├── product-card/
│   ├── shop-card/
│   └── rating-stars/
├── utils/          # 工具函数
│   ├── request.js  # 网络请求封装
│   └── format.js   # 格式化工具
├── api/            # API接口
│   ├── product.js
│   ├── order.js
│   └── user.js
└── app.js          # 全局配置
```

### 2. 网络请求封装

```javascript
// utils/request.js
const BASE_URL = 'https://api.huanyuan-maker.com'

function request(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + options.url,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'Authorization': wx.getStorageSync('token')
      },
      success: (res) => {
        if (res.statusCode === 200) {
          resolve(res.data)
        } else {
          wx.showToast({ title: '请求失败', icon: 'none' })
          reject(res)
        }
      },
      fail: (err) => {
        wx.showToast({ title: '网络错误', icon: 'none' })
        reject(err)
      }
    })
  })
}

module.exports = { request }
```

### 3. 错误处理

- 所有API调用必须有 try-catch 或 .catch()
- 用户友好提示（wx.showToast）
- 关键操作二次确认（项目内优先使用 `van-dialog` 或统一封装）

### 4. 性能优化

- 图片懒加载
- 列表分页加载
- 避免频繁 setData
- 使用 wx:key 优化列表渲染

### 5. 注释规范

```javascript
/**
 * 创建订单
 * @param {Object} orderData - 订单数据
 * @param {String} orderData.productId - 商品ID
 * @param {String} orderData.deliveryType - 配送类型
 * @returns {Promise} 订单信息
 */
async function createOrder(orderData) {
  // 验证必填字段
  if (!orderData.productId) {
    throw new Error('商品ID不能为空')
  }
  
  // 调用API
  const result = await request({
    url: '/orders',
    method: 'POST',
    data: orderData
  })
  
  return result
}
```

## 常见功能实现

### 1. 店铺认证标识

```html
<!-- WXML -->
<view class="shop-info">
  <image src="{{shop.logo}}" class="shop-logo"></image>
  <text class="shop-name">{{shop.name}}</text>
  <view wx:if="{{shop.isVerified}}" class="verified-badge">
    <text>官方认证</text>
  </view>
</view>
```

```css
/* WXSS */
.verified-badge {
  background: #4A90E2;
  color: white;
  padding: 2rpx 8rpx;
  border-radius: 4rpx;
  font-size: 20rpx;
}
```

### 2. 评分星级组件

```javascript
// components/rating-stars/rating-stars.js
Component({
  properties: {
    rating: { type: Number, value: 0 },
    size: { type: Number, value: 24 }
  },
  
  methods: {
    getStars() {
      const fullStars = Math.floor(this.data.rating)
      const hasHalf = this.data.rating % 1 >= 0.5
      return { fullStars, hasHalf }
    }
  }
})
```

### 3. 时间选择器（服务预约）

```html
<picker mode="multiSelector" 
        bindchange="onTimeChange" 
        value="{{timeIndex}}" 
        range="{{timeRanges}}">
  <view class="time-picker">
    {{selectedTime || '请选择预约时间'}}
  </view>
</picker>
```

## 测试检查清单

开发每个功能时，确保：

- UI符合设计规范（颜色、间距、字体）
- 交互流畅，有加载状态提示
- 错误处理完善（网络异常、数据为空）
- 兼容不同屏幕尺寸
- 关键操作有二次确认
- 数据持久化正确（本地缓存）
- 权限申请合理（位置、通知等）

## 快速开始模板

当需要创建新页面时，使用以下模板：

```javascript
// pages/example/example.js
Page({
  data: {
    // 页面数据
  },

  onLoad(options) {
    // 页面加载
    this.loadData()
  },

  onPullDownRefresh() {
    // 下拉刷新
    this.loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadData() {
    try {
      // 加载数据逻辑
    } catch (error) {
      console.error('加载失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 事件处理
  handleTap(e) {
    // 处理点击
  }
})
```

## 注意事项

1. **严格遵守微信审核规范**：避免违规内容
2. **用户体验优先**：加载状态、错误提示必须清晰
3. **数据安全**：敏感信息加密传输，不在前端存储
4. **性能监控**：关注首屏加载时间、页面切换流畅度
5. **版本兼容**：测试不同微信版本的兼容性

## 相关资源

- 微信小程序官方文档：[https://developers.weixin.qq.com/miniprogram/dev/framework/](https://developers.weixin.qq.com/miniprogram/dev/framework/)
- Vant Weapp组件库：[https://vant-contrib.gitee.io/vant-weapp/](https://vant-contrib.gitee.io/vant-weapp/)
- 设计稿参考：见项目根目录原型设计文档

