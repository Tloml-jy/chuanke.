# 开发规范与最佳实践

> 文档状态：规划参考（P2）。  
> 说明：本文件包含通用最佳实践与模板，具体业务状态流转、接口 action、字段定义请以 `README.md`、`cloud-functions.md`、`business-flows.md` 为准。

## 一、代码组织规范

### 1.1 目录结构

```
miniprogram/
├── pages/           # 页面（每个页面4个文件）
│   ├── home/
│   │   ├── home.js      # 逻辑层
│   │   ├── home.json    # 配置
│   │   ├── home.wxml    # 结构
│   │   └── home.wxss    # 样式
│   └── ...
├── components/      # 公共组件
│   ├── goods-card/
│   │   ├── goods-card.js
│   │   ├── goods-card.json
│   │   ├── goods-card.wxml
│   │   └── goods-card.wxss
│   └── ...
├── utils/          # 工具函数
│   ├── request.js   # 网络请求封装
│   ├── role-guard.js # 页面级权限守卫（商户/管理员页）
│   ├── price.js     # 价格换算
│   └── validator.js # 表单校验
├── store/          # 全局状态
│   └── index.js
└── app.js          # 小程序入口
```

### 1.2 命名规范

**文件命名**：

- 页面/组件文件夹：小写+连字符，如 `goods-card`
- JS文件：与文件夹同名
- 工具函数：小写+连字符，如 `price-format.js`

**变量命名**：

```javascript
// 常量：大写+下划线
const MAX_PAGE_SIZE = 20
const API_BASE_URL = 'https://api.example.com'

// 变量/函数：小驼峰
let userName = '张三'
function getUserInfo() { }

// 类/组件：大驼峰
class UserInfo { }
Component({ })

// 私有变量：下划线前缀
let _privateVar = null
```

**CSS类名**：

```css
/* BEM规范 */
.goods-card { }                    /* 块 */
.goods-card__title { }             /* 元素 */
.goods-card--active { }            /* 修饰符 */
.goods-card__image--large { }      /* 元素+修饰符 */
```

---

## 二、云函数调用规范

### 2.1 统一调用方式

**必须使用封装的 `call` 函数**：

```javascript
// ✅ 正确
const { call } = require('../../utils/request')

async function loadProducts() {
  const res = await call('product', {
    action: 'getList',
    categoryId: 'cat_001',
    page: 1,
    pageSize: 10
  }, {
    loading: true,
    loadingText: '加载中...'
  })
  
  if (res && res.code === 0) {
    this.setData({ productList: res.data.list })
  }
}

// ❌ 错误：直接调用 wx.cloud.callFunction（除非你在封装内部）
wx.cloud.callFunction({
  name: 'product',
  data: { action: 'getList' }
})
```

### 2.2 错误处理

**所有异步操作必须有错误处理**：

```javascript
// ✅ 正确
try {
  const res = await call('order', {
    action: 'create',
    cartIds: this.data.selectedCartIds
  })
  
  if (res && res.code === 0) {
    // 成功逻辑
    wx.navigateTo({ url: '/pages/order/detail/detail?id=' + res.data.orderId })
  } else if (res) {
    // 业务错误（call函数已显示toast）
    console.error('业务错误:', res.message)
  }
} catch (err) {
  // 网络异常等
  console.error('请求异常:', err)
  wx.showToast({ title: '网络异常，请重试', icon: 'none' })
}

// ❌ 错误：没有错误处理
const res = await call('order', { action: 'create' })
this.setData({ orderId: res.data.orderId })
```

### 2.3 常见错误码处理

```javascript
// 根据错误码做不同处理
if (res.code === 401) {
  // 登录态失效，跳转登录页
  wx.navigateTo({ url: '/pages/auth/login/login' })
} else if (res.code === 1001) {
  // 库存不足，刷新商品详情
  this.loadProductDetail()
  wx.showToast({ title: '库存不足', icon: 'none' })
} else if (res.code === 2001) {
  // 商品已下架，从购物车移除
  this.removeFromCart(itemId)
}
```

> 提醒：具体 `code` 语义请以 `cloud-functions.md` 为准；同一 code 在不同模块可能 message 不同，前端展示优先使用 message。

---

## 三、页面开发规范

### 3.1 页面生命周期模板

```javascript
// pages/example/example.js
const { call } = require('../../utils/request')
const { guardPageAccess } = require('../../utils/role-guard')

Page({
  data: {
    list: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
    refreshing: false
  },

  onLoad(options) {
    // 1. 权限检查（商户/管理员受限页面）
    if (!guardPageAccess('pages/example/example')) return

    // 2. 初始加载
    this.loadList(true)

    // 3. 注册全局状态监听（如需要）
    // getApp().store.on('cartCount', this.onCartChange.bind(this))
  },

  onUnload() {
    // 清理监听
    // getApp().store.off('cartCount', this.onCartChange)
  },

  onPullDownRefresh() {
    this.setData({ refreshing: true })
    this.loadList(true).then(() => {
      wx.stopPullDownRefresh()
      this.setData({ refreshing: false })
    })
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadList(false)
    }
  },

  /**
   * 加载列表（通用分页）
   * @param {boolean} isRefresh 是否刷新
   */
  async loadList(isRefresh = false) {
    if (this.data.loading) return
    this.setData({ loading: true })

    const page = isRefresh ? 1 : this.data.page
    const skip = (page - 1) * this.data.pageSize

    try {
      const res = await call('cloudFunctionName', {
        action: 'getList',
        page,
        pageSize: this.data.pageSize
        // ...其他查询参数
      })

      if (res && res.code === 0) {
        const newList = isRefresh ? res.data.list : [...this.data.list, ...res.data.list]
        this.setData({
          list: newList,
          page: page + 1,
          hasMore: res.data.hasMore,
        })
      }
    } catch (err) {
      console.error('加载失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 事件处理
   */
  handleTap(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  }
})
```

### 3.2 WXML 编写规范

```html
<!-- ✅ 正确：使用 wx:key -->
<view wx:for="{{list}}" wx:key="_id">
  <text>{{item.name}}</text>
</view>

<!-- ✅ 正确：条件渲染用 wx:if -->
<view wx:if="{{list.length > 0}}">
  <!-- 列表内容 -->
</view>
<view wx:else>
  <empty-state text="暂无数据" />
</view>

<!-- ✅ 正确：事件传参用 data-* -->
<button bindtap="handleTap" data-id="{{item._id}}">
  查看详情
</button>

<!-- ❌ 错误：没有 wx:key -->
<view wx:for="{{list}}">
  <text>{{item.name}}</text>
</view>

<!-- ❌ 错误：在 WXML 中做复杂计算 -->
<view wx:if="{{list.filter(item => item.status === 'on').length > 0}}">
```

### 3.3 WXSS 编写规范

```css
/* ✅ 正确：使用 rpx 单位 */
.container {
  padding: 20rpx;
  font-size: 28rpx;
}

/* ✅ 正确：使用 CSS 变量 */
.title {
  color: var(--primary-color);
}

/* ✅ 正确：flex 布局 */
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* ❌ 错误：使用 px 单位 */
.container {
  padding: 10px;
}

/* ❌ 错误：使用 !important */
.title {
  color: red !important;
}
```

**全局 CSS 变量**（app.wxss）：

```css
page {
  --primary-color: #4A90E2;
  --success-color: #52c41a;
  --warning-color: #faad14;
  --error-color: #f5222d;
  --text-color: #333333;
  --text-secondary: #666666;
  --border-color: #e8e8e8;
  --bg-color: #f5f5f5;
}
```

---

## 四、组件开发规范

### 4.1 组件模板

```javascript
// components/goods-card/goods-card.js
Component({
  /**
   * 组件属性
   */
  properties: {
    goods: {
      type: Object,
      value: {}
    },
    showAction: {
      type: Boolean,
      value: false
    }
  },

  /**
   * 组件内部数据
   */
  data: {
    priceYuan: 0
  },

  /**
   * 生命周期
   */
  lifetimes: {
    attached() {
      this.updatePrice()
    }
  },

  /**
   * 数据监听
   */
  observers: {
    'goods.price': function(price) {
      this.updatePrice()
    }
  },

  /**
   * 组件方法
   */
  methods: {
    updatePrice() {
      this.setData({
        priceYuan: (this.data.goods.price / 100).toFixed(2)
      })
    },

    onTap() {
      this.triggerEvent('tap', {
        id: this.data.goods._id
      })
    }
  }
})
```

```json
// components/goods-card/goods-card.json
{
  "component": true,
  "usingComponents": {}
}
```

```html
<!-- components/goods-card/goods-card.wxml -->
<view class="goods-card" bindtap="onTap">
  <image class="goods-card__image" src="{{goods.image}}" mode="aspectFill" />
  <view class="goods-card__content">
    <text class="goods-card__title">{{goods.name}}</text>
    <text class="goods-card__price">¥{{priceYuan}}</text>
  </view>
</view>
```

```css
/* components/goods-card/goods-card.wxss */
.goods-card {
  display: flex;
  padding: 20rpx;
  background: white;
  border-radius: 8rpx;
}

.goods-card__image {
  width: 160rpx;
  height: 160rpx;
  border-radius: 8rpx;
}

.goods-card__content {
  flex: 1;
  margin-left: 20rpx;
}

.goods-card__title {
  font-size: 28rpx;
  color: var(--text-color);
}

.goods-card__price {
  font-size: 32rpx;
  color: var(--primary-color);
  font-weight: bold;
}
```

---

## 五、性能优化规范

### 5.1 避免频繁 setData

```javascript
// ✅ 正确：合并更新
this.setData({
  userName: '张三',
  userAge: 20,
  userCollege: '环境工程学院'
})

// ✅ 正确：只更新变化的字段
this.setData({
  'list[0].name': '新名称'
})

// ❌ 错误：循环中频繁 setData
list.forEach((item, index) => {
  this.setData({
    [`list[${index}].checked`]: true
  })
})

// ✅ 正确：先构建新数组，再一次性更新
const newList = list.map(item => ({ ...item, checked: true }))
this.setData({ list: newList })
```

### 5.2 图片优化

```html
<!-- ✅ 正确：使用懒加载 -->
<image src="{{item.image}}" lazy-load mode="aspectFill" />

<!-- ✅ 正确：指定图片模式 -->
<image src="{{item.image}}" mode="aspectFill" />

<!-- ❌ 错误：大图不压缩 -->
<image src="{{item.originalImage}}" />
```

**图片上传前压缩**：

```javascript
// utils/image.js
function compressImage(filePath) {
  return new Promise((resolve) => {
    wx.compressImage({
      src: filePath,
      quality: 80,
      success: (res) => resolve(res.tempFilePath),
      fail: () => resolve(filePath)
    })
  })
}
```

### 5.3 列表优化

```javascript
// ✅ 正确：使用 wx:key
<view wx:for="{{list}}" wx:key="_id">

// ✅ 正确：分页加载
onReachBottom() {
  if (this.data.hasMore && !this.data.loading) {
    this.loadList(false)
  }
}

// ❌ 错误：一次性加载全部数据
const { data } = await db.collection('products').get()
```

---

## 六、安全规范

### 6.1 登录态校验

**所有涉及用户数据的操作必须校验登录态**：

```javascript
// 云函数入口校验
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  // 查询用户
  const { data: users } = await db.collection('users')
    .where({ _openid: openid })
    .get()
  
  if (!users || users.length === 0) {
    return { code: 401, message: '未登录', data: null }
  }
  
  const user = users[0]
  
  // 角色校验
  if (event.action === 'create' && user.role !== 'merchant') {
    return { code: 403, message: '无权限', data: null }
  }
  
  // 继续业务逻辑...
}
```

### 6.2 敏感信息保护

```javascript
// ✅ 正确：手机号脱敏
const phone = user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')

// ✅ 正确：真实姓名脱敏
const realName = user.realName.substring(0, 1) + '*'

// ❌ 错误：前端存储敏感信息
wx.setStorageSync('password', password)
```

### 6.3 支付回调验签

```javascript
// 支付回调云函数
exports.main = async (event, context) => {
  // 1. 验签
  const isValid = verifySignature(event)
  if (!isValid) {
    return { code: 'FAIL', message: '签名无效' }
  }
  
  // 2. 幂等校验
  const { transactionId } = event
  const { data: payments } = await db.collection('payments')
    .where({ transactionId })
    .get()
  
  if (payments.length > 0) {
    // 已处理过，直接返回成功
    return { code: 'SUCCESS', message: '成功' }
  }
  
  // 3. 更新订单状态
  // ...
  
  return { code: 'SUCCESS', message: '成功' }
}
```

---

## 七、调试与日志

### 7.1 日志规范

```javascript
// ✅ 正确：结构化日志
console.log('[order/create] 开始创建订单', {
  userId: openid,
  cartIds,
  totalAmount
})

console.error('[order/create] 创建失败', err, {
  userId: openid,
  errorCode: err.code
})

// ❌ 错误：无意义日志
console.log('test')
console.log(123)
```

### 7.2 真机调试

**开启真机调试**：

1. 微信开发者工具 → 真机调试
2. 扫码连接真机
3. 查看 Console 面板日志

**远程日志**：

```javascript
// 上报错误到云端
function reportError(error, context) {
  wx.cloud.callFunction({
    name: 'admin',
    data: {
      action: 'reportError',
      error: error.message,
      stack: error.stack,
      context
    }
  })
}
```

---

## 八、发布前检查清单

### 8.1 功能测试

- 所有页面能正常打开
- 登录/注册流程正常
- 商品浏览、搜索正常
- 下单、支付流程正常（当前履约为到店自提，不支持配送）
- 订单核销流程正常
- 评价功能正常
- 商户端功能正常
- 下拉刷新、上拉加载正常

### 8.2 兼容性测试

- iOS 设备测试
- Android 设备测试
- 不同屏幕尺寸适配
- 微信版本兼容性（最低支持 7.0.0）

### 8.3 性能测试

- 首屏加载时间 < 2s
- 页面切换流畅无卡顿
- 图片加载优化
- 内存占用合理

### 8.4 安全检查

- 所有接口校验登录态
- 敏感信息脱敏
- 支付回调验签
- 无硬编码密钥

### 8.5 代码质量

- 无 console.log 生产代码
- 无 TODO/FIXME 注释
- 代码格式化
- 注释清晰

---

## 九、常见问题 FAQ

### Q1: setData 后页面没更新？

**原因**：setData 是异步的，立即读取 data 可能还是旧值

**解决**：

```javascript
this.setData({
  count: this.data.count + 1
}, () => {
  // 回调中读取新值
  console.log(this.data.count)
})
```

### Q2: 云函数调用超时？

**原因**：云函数执行超过3秒

**解决**：

1. 优化数据库查询（加索引）
2. 减少不必要的计算
3. 拆分复杂逻辑到多个云函数
4. 设置云函数超时时间（最长60秒）

### Q3: 图片加载慢？

**解决**：

1. 上传前压缩图片
2. 使用 CDN 加速
3. 启用懒加载
4. 使用 WebP 格式

### Q4: 列表滚动卡顿？

**解决**：

1. 使用 wx:key
2. 减少单次渲染数量（分页）
3. 避免在列表中嵌套复杂组件
4. 图片使用懒加载

---

*文档版本：V1.0 | 日期：2026-03-12*