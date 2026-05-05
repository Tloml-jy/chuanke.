const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const { canOpenidManageMerchant } = require('./merchantAccess')
const { sha256, createAdminSession } = require('./adminAuth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const ENCRYPT_ALGO = 'aes-256-cbc'
const SENSITIVE_FIELDS = ['apiV3Key', 'apiClientCertPath', 'apiClientKeyPath', 'platformCertPath']

function getEncryptKey() {
  const secret = process.env.PAY_CONFIG_SECRET || ''
  if (!secret) return null
  return crypto.createHash('sha256').update(secret).digest()
}

function encryptValue(plain) {
  if (!plain) return ''
  const key = getEncryptKey()
  if (!key) return plain
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ENCRYPT_ALGO, key, iv)
  let encrypted = cipher.update(plain, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return 'enc:' + iv.toString('hex') + ':' + encrypted
}

function decryptValue(cipherText) {
  if (!cipherText || !cipherText.startsWith('enc:')) return cipherText
  const key = getEncryptKey()
  if (!key) return cipherText.replace(/^enc:/, '')
  try {
    const parts = cipherText.slice(4).split(':')
    const iv = Buffer.from(parts[0], 'hex')
    const encrypted = parts[1]
    const decipher = crypto.createDecipheriv(ENCRYPT_ALGO, key, iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (e) {
    console.error('[system] decryptValue error:', e.message)
    return cipherText
  }
}

function encryptSensitiveFields(data) {
  if (!data) return data
  const result = { ...data }
  for (const field of SENSITIVE_FIELDS) {
    if (result[field]) result[field] = encryptValue(result[field])
  }
  return result
}

function decryptSensitiveFields(data) {
  if (!data) return data
  const result = { ...data }
  for (const field of SENSITIVE_FIELDS) {
    if (result[field]) result[field] = decryptValue(result[field])
  }
  return result
}

function maskSensitiveFields(data) {
  if (!data) return data
  const result = { ...data }
  for (const field of SENSITIVE_FIELDS) {
    if (result[field]) result[field] = '***'
  }
  return result
}

function restoreSensitiveFromOld(newPayload, oldPayload) {
  if (!newPayload || !oldPayload) return newPayload
  const result = { ...newPayload }
  for (const field of SENSITIVE_FIELDS) {
    if (result[field] === '***') result[field] = oldPayload[field] || ''
  }
  return result
}

function success(data) {
  return { code: 0, message: 'success', data }
}

function fail(code, message) {
  return { code, message, data: null }
}

/** 是否为管理员账号（users.role === 'admin'），支持 openid 和 adminToken 双通道 */
async function isOpenidAdmin(openid, adminToken) {
  if (openid) {
    const uRes = await db.collection('users').where({ _openid: openid }).limit(1).get().catch(() => null)
    const u = uRes && uRes.data && uRes.data[0]
    if (String(u && u.role ? u.role : '') === 'admin') return true
  }
  if (adminToken) {
    try {
      const tokenHash = sha256(adminToken)
      const sessRes = await db.collection('admin_sessions').doc(tokenHash).get().catch(() => null)
      if (sessRes && sessRes.data && Date.now() < sessRes.data.expiresAt) return true
    } catch (e) { /* ignore */ }
  }
  return false
}

/** 云函数侧校验管理员，非管理员返回 fail 响应 */
async function assertOpenidIsAdmin(openid, adminToken) {
  if (!(await isOpenidAdmin(openid, adminToken))) return fail(403, '无权操作，需管理员权限')
  return null
}

function normalizeText(value, maxLen = 500) {
  const text = String(value == null ? '' : value).trim()
  return text.length > maxLen ? text.slice(0, maxLen) : text
}

function normalizeBool(value, defaultValue = false) {
  if (typeof value === 'boolean') return value
  if (value == null) return defaultValue
  if (typeof value === 'number') return value !== 0
  const text = String(value).trim().toLowerCase()
  if (text === 'true' || text === '1') return true
  if (text === 'false' || text === '0') return false
  return defaultValue
}

function normalizePriority(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  if (n > 1000000) return 1000000
  if (n < -1000000) return -1000000
  return Math.trunc(n)
}

function normalizeMerchantId(raw) {
  const merchantId = normalizeText(raw, 64)
  if (!merchantId) return ''
  if (!/^[a-zA-Z0-9_-]+$/.test(merchantId)) return ''
  return merchantId
}

function parseTime(value) {
  if (!value) return null
  const t = new Date(String(value)).getTime()
  return Number.isFinite(t) ? t : null
}

function normalizeNoticeItem(item, index) {
  if (typeof item === 'string') {
    const text = normalizeText(item, 500)
    if (!text) return null
    return {
      id: `notice_${index + 1}`,
      text,
      tag: '',
      priority: 0,
      publishTime: '',
      startTime: '',
      endTime: '',
      enabled: true,
      order: index
    }
  }
  if (!item || typeof item !== 'object') return null
  const text = normalizeText(item.text || item.noticeText || '', 500)
  if (!text) return null
  const id = normalizeText(item.id || `notice_${index + 1}`, 64)
  const startTime = normalizeText(item.startTime || '', 32)
  const endTime = normalizeText(item.endTime || '', 32)
  const startTs = parseTime(startTime)
  const endTs = parseTime(endTime)
  if (startTime && !startTs) return null
  if (endTime && !endTs) return null
  if (startTs && endTs && startTs > endTs) return null
  const tagRaw = normalizeText(item.tag || '', 10)
  const tag = ['紧急', '活动', '通知'].includes(tagRaw) ? tagRaw : ''
  return {
    id: id || `notice_${index + 1}`,
    text,
    tag,
    priority: normalizePriority(item.priority),
    publishTime: normalizeText(item.publishTime || '', 32),
    startTime,
    endTime,
    enabled: normalizeBool(item.enabled, true),
    order: Number(item.order || index)
  }
}

function normalizeNoticeList(data) {
  const list = Array.isArray(data?.notices) ? data.notices : []
  const now = Date.now()
  const cleaned = list
    .map((item, index) => normalizeNoticeItem(item, index))
    .filter((item) => !!item)
    .filter((item) => {
      if (!item.enabled) return false
      const startTime = parseTime(item.startTime)
      const endTime = parseTime(item.endTime)
      if (startTime && now < startTime) return false
      if (endTime && now > endTime) return false
      return true
    })
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      return a.order - b.order
    })
    .slice(0, 20)
  if (cleaned.length > 0) return cleaned
  const fallback = String(data?.noticeText || '').trim()
  return fallback
    ? [{
      id: 'legacy_notice',
      text: fallback,
      tag: '',
      priority: 0,
      publishTime: '',
      startTime: '',
      endTime: '',
      enabled: true,
      order: 0
    }]
    : []
}

function normalizeNoticeListForAdmin(data) {
  const list = Array.isArray(data?.notices) ? data.notices : []
  const cleaned = list
    .map((item, index) => normalizeNoticeItem(item, index))
    .filter((item) => !!item)
    .slice(0, 100)
  if (cleaned.length > 0) return cleaned
  const fallback = String(data?.noticeText || '').trim()
  if (!fallback) return []
  return [{
    id: 'legacy_notice',
    text: fallback,
    tag: '',
    priority: 0,
    publishTime: '',
    startTime: '',
    endTime: '',
    enabled: true,
    order: 0
  }]
}

async function getDocOrNull(docId) {
  const res = await db.collection('system_settings').doc(docId).get().catch(() => null)
  return res && res.data ? res.data : null
}

function buildNoticePayload(data) {
  const enabled = data ? Boolean(data.enabled) : false
  const noticeItems = normalizeNoticeList(data)
  const notices = noticeItems.map((item) => item.text)
  const noticeText = notices.join('\n')
  return {
    enabled,
    noticeItems,
    notices,
    noticeText,
    source: data ? 'cloud' : 'default'
  }
}

function buildNoticeAdminPayload(data) {
  const enabled = data ? Boolean(data.enabled) : false
  const noticeItems = normalizeNoticeListForAdmin(data)
  const notices = noticeItems.map((item) => item.text)
  const noticeText = notices.join('\n')
  return {
    enabled,
    noticeItems,
    notices,
    noticeText,
    source: data ? 'cloud' : 'default'
  }
}

function buildWritableNoticeItem(item, index) {
  const normalized = normalizeNoticeItem(item, index)
  if (!normalized) return null
  return {
    id: normalized.id,
    text: normalized.text,
    tag: normalized.tag,
    priority: Number(normalized.priority || 0),
    publishTime: normalized.publishTime,
    startTime: normalized.startTime,
    endTime: normalized.endTime,
    enabled: normalized.enabled !== false,
    order: index
  }
}

function buildWritableNoticeList(event) {
  const source = Array.isArray(event?.noticeItems)
    ? event.noticeItems
    : (Array.isArray(event?.notices) ? event.notices : [])
  const cleaned = source
    .map((item, index) => buildWritableNoticeItem(item, index))
    .filter((item) => !!item)
    .slice(0, 100)
  if (cleaned.length > 0) return cleaned
  const fallback = String(event?.noticeText || '').trim()
  if (!fallback) return []
  return fallback
    .split('\n')
    .map((text) => text.trim())
    .filter((text) => !!text)
    .slice(0, 100)
    .map((text, index) => ({
      id: `notice_${index + 1}`,
      text,
      tag: '',
      priority: 0,
      publishTime: '',
      startTime: '',
      endTime: '',
      enabled: true,
      order: index
    }))
}

function validateWritableNoticeList(noticeItems) {
  const uniq = new Set()
  for (let i = 0; i < noticeItems.length; i += 1) {
    const item = noticeItems[i]
    const id = String(item.id || '')
    if (!id) return fail(422, `第 ${i + 1} 条公告缺少 id`)
    if (uniq.has(id)) return fail(422, `公告 id 重复：${id}`)
    uniq.add(id)
  }
  return null
}

async function saveNoticeConfig(docId, enabled, noticeItems) {
  const payload = {
    enabled: Boolean(enabled),
    notices: noticeItems,
    noticeText: noticeItems.map((item) => item.text).join('\n'),
    updateTime: db.serverDate()
  }
  await db.collection('system_settings').doc(docId).set({ data: payload })
  return payload
}

function normalizeContactItem(item, index) {
  if (!item || typeof item !== 'object') return null
  const type = normalizeText(item.type || '', 30)
  const label = normalizeText(item.label || '', 50)
  const value = normalizeText(item.value || '', 200)
  if (!type || !value) return null
  return {
    id: normalizeText(item.id || `contact_${index + 1}`, 64) || `contact_${index + 1}`,
    type,
    label,
    value,
    icon: normalizeText(item.icon || '', 30),
    placeholder: normalizeText(item.placeholder || '', 100),
    enabled: normalizeBool(item.enabled, true),
    order: Number(item.order ?? index)
  }
}

function buildDefaultContacts() {
  return [
    { id: 'contact_phone', type: 'phone', label: '客服电话', value: '待管理员配置', icon: 'call', placeholder: '如 400-xxx-xxxx', enabled: true, order: 0 },
    { id: 'contact_email', type: 'email', label: '客服邮箱', value: '待管理员配置', icon: 'mail', placeholder: '如 support@example.com', enabled: true, order: 1 },
    { id: 'contact_wechat', type: 'wechat', label: '微信客服', value: '待管理员配置', icon: 'logo-wechat', placeholder: '如 kefu_wechat', enabled: true, order: 2 }
  ]
}

async function saveContactConfig(event) {
  const serviceHours = normalizeText(event?.serviceHours || '周一至周日 09:00-21:00', 100) || '周一至周日 09:00-21:00'
  const supportWechat = normalizeText(event?.supportWechat || '待管理员配置', 80) || '待管理员配置'
  const supportEmail = normalizeText(event?.supportEmail || '待管理员配置', 80) || '待管理员配置'
  let contacts = []
  if (Array.isArray(event?.contacts)) {
    contacts = event.contacts
      .map((item, idx) => normalizeContactItem(item, idx))
      .filter(Boolean)
      .slice(0, 20)
  }
  const payload = {
    serviceHours,
    supportWechat,
    supportEmail,
    contacts: contacts.length > 0 ? contacts : buildDefaultContacts(),
    updateTime: db.serverDate()
  }
  await db.collection('system_settings').doc('contact').set({ data: payload })
  return payload
}

async function getDashboardTrend(event) {
  const days = Math.max(1, Math.min(90, Number(event?.days || 7)))
  const now = new Date()
  const startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - (days - 1) * 86400000
  const endMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() + 86400000
  const startDate = new Date(startMs)
  const endDate = new Date(endMs)

  const [orderRes, bookingRes] = await Promise.all([
    db.collection('orders')
      .where({ createTime: db.command.and(db.command.gte(startDate), db.command.lt(endDate)) })
      .limit(1000)
      .field({ createTime: true, totalAmount: true, status: true })
      .get().catch(() => ({ data: [] })),
    db.collection('bookings')
      .where({ createTime: db.command.and(db.command.gte(startDate), db.command.lt(endDate)) })
      .limit(1000)
      .field({ createTime: true, status: true })
      .get().catch(() => ({ data: [] }))
  ])

  const orderList = Array.isArray(orderRes.data) ? orderRes.data : []
  const bookingList = Array.isArray(bookingRes.data) ? bookingRes.data : []

  const dayMap = {}
  for (let i = 0; i < days; i++) {
    const d = new Date(startMs + i * 86400000)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const label = `${d.getMonth() + 1}/${d.getDate()}`
    dayMap[key] = { date: label, dateKey: key, orders: 0, revenue: 0, bookings: 0 }
  }

  for (const o of orderList) {
    const ct = o.createTime
    if (!ct) continue
    const t = typeof ct === 'object' && ct.$date ? new Date(ct.$date) : new Date(ct)
    const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    if (dayMap[key]) {
      dayMap[key].orders++
      dayMap[key].revenue += Number(o.totalAmount) || 0
    }
  }

  for (const b of bookingList) {
    const ct = b.createTime
    if (!ct) continue
    const t = typeof ct === 'object' && ct.$date ? new Date(ct.$date) : new Date(ct)
    const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    if (dayMap[key]) {
      dayMap[key].bookings++
    }
  }

  const trend = Object.values(dayMap)
  const totalOrders = trend.reduce((s, d) => s + d.orders, 0)
  const totalRevenue = trend.reduce((s, d) => s + d.revenue, 0)
  const totalBookings = trend.reduce((s, d) => s + d.bookings, 0)
  const avgOrders = days > 0 ? Math.round(totalOrders / days * 10) / 10 : 0
  const avgRevenue = days > 0 ? Math.round(totalRevenue / days) : 0

  return { days, trend, summary: { totalOrders, totalRevenue, totalBookings, avgOrders, avgRevenue } }
}

function buildDefaultPayConfig() {
  return {
    payMode: 'mock',
    appId: '',
    serviceProviderMchId: '',
    merchantSerialNo: '',
    notifyUrl: '',
    apiV3Key: '',
    apiClientCertPath: '',
    apiClientKeyPath: '',
    platformCertPath: '',
    merchantApplyStatus: 'applying',
    onboardingNote: '服务商商户号申请中',
    defaultSettlementMode: 'manual_withdraw',
    subMerchantIdSource: 'merchant_field',
    subMerchantFieldName: 'wechatSubMchId',
    refundEnabled: false,
    profitSharingEnabled: false,
    transferEnabled: false,
    source: 'default'
  }
}

function normalizePayMode(value) {
  const t = normalizeText(value, 20).toLowerCase()
  return ['mock', 'live'].includes(t) ? t : 'mock'
}

function normalizeApplyStatus(value) {
  const t = normalizeText(value, 30).toLowerCase()
  return ['applying', 'approved', 'rejected', 'unknown'].includes(t) ? t : 'applying'
}

function normalizeSettlementMode(value) {
  const t = normalizeText(value, 30).toLowerCase()
  return ['manual_withdraw', 'auto_profit_sharing', 'manual_transfer'].includes(t) ? t : 'manual_withdraw'
}

function normalizeSubMerchantSource(value) {
  const t = normalizeText(value, 30).toLowerCase()
  return ['merchant_field', 'relation_field', 'system_default'].includes(t) ? t : 'merchant_field'
}

function buildPayConfigPayload(data) {
  const base = buildDefaultPayConfig()
  if (!data) return base
  const apiV3Key = normalizeText(data.apiV3Key || '', 128)
  const apiClientCertPath = normalizeText(data.apiClientCertPath || '', 512)
  const apiClientKeyPath = normalizeText(data.apiClientKeyPath || '', 512)
  const platformCertPath = normalizeText(data.platformCertPath || '', 512)
  return {
    payMode: normalizePayMode(data.payMode || base.payMode),
    appId: normalizeText(data.appId || '', 64),
    serviceProviderMchId: normalizeText(data.serviceProviderMchId || '', 64),
    merchantSerialNo: normalizeText(data.merchantSerialNo || '', 128),
    notifyUrl: normalizeText(data.notifyUrl || '', 512),
    apiV3Key,
    apiClientCertPath,
    apiClientKeyPath,
    platformCertPath,
    apiV3KeyConfigured: !!apiV3Key,
    apiClientCertConfigured: !!apiClientCertPath,
    apiClientKeyConfigured: !!apiClientKeyPath,
    platformCertConfigured: !!platformCertPath,
    merchantApplyStatus: normalizeApplyStatus(data.merchantApplyStatus || base.merchantApplyStatus),
    onboardingNote: normalizeText(data.onboardingNote || base.onboardingNote, 300),
    defaultSettlementMode: normalizeSettlementMode(data.defaultSettlementMode || base.defaultSettlementMode),
    subMerchantIdSource: normalizeSubMerchantSource(data.subMerchantIdSource || base.subMerchantIdSource),
    subMerchantFieldName: normalizeText(data.subMerchantFieldName || base.subMerchantFieldName, 64),
    refundEnabled: normalizeBool(data.refundEnabled, false),
    profitSharingEnabled: normalizeBool(data.profitSharingEnabled, false),
    transferEnabled: normalizeBool(data.transferEnabled, false),
    source: 'cloud'
  }
}

function buildPayReadiness(config) {
  const missing = []
  if (!config.serviceProviderMchId) missing.push('服务商商户号')
  if (!config.appId) missing.push('小程序 AppId')
  if (!config.notifyUrl) missing.push('支付通知地址')
  if (!config.merchantSerialNo) missing.push('商户证书序列号')
  if (!config.apiV3KeyConfigured) missing.push('APIv3 密钥')
  if (!config.apiClientCertConfigured) missing.push('商户 API 证书')
  if (!config.apiClientKeyConfigured) missing.push('商户 API 私钥')
  if (!config.platformCertConfigured) missing.push('微信支付平台证书')
  return {
    readyForJsapi: missing.length === 0 && config.payMode === 'live',
    missingItems: missing
  }
}

async function savePayConfig(event) {
  const base = buildPayConfigPayload(event)
  const encrypted = encryptSensitiveFields(base)
  const payload = {
    ...encrypted,
    updateTime: db.serverDate()
  }
  await db.collection('system_settings').doc('pay_config').set({ data: payload })
  return base
}

async function ensureSettingsCollection() {
  await db.collection('system_settings').limit(1).get().catch(async (error) => {
    const msg = String(error?.errMsg || error?.message || '')
    const notExist = msg.includes('DATABASE_COLLECTION_NOT_EXIST') || msg.includes('Db or Table not exist') || msg.includes('-502005')
    if (!notExist) throw error
    if (typeof db.createCollection === 'function') {
      await db.createCollection('system_settings')
      return
    }
    throw new Error('system_settings 集合不存在，请先在云开发控制台创建')
  })
}

async function ensureBannersCollection() {
  await db.collection('banners').limit(1).get().catch(async (error) => {
    const msg = String(error?.errMsg || error?.message || '')
    const notExist = msg.includes('DATABASE_COLLECTION_NOT_EXIST') || msg.includes('Db or Table not exist') || msg.includes('-502005')
    if (!notExist) throw error
    if (typeof db.createCollection === 'function') {
      await db.createCollection('banners')
      return
    }
    throw new Error('banners 集合不存在，请先在云开发控制台创建')
  })
}

async function ensureSearchLogsCollection() {
  await db.collection('search_logs').limit(1).get().catch(async (error) => {
    const msg = String(error?.errMsg || error?.message || '')
    const notExist = msg.includes('DATABASE_COLLECTION_NOT_EXIST') || msg.includes('Db or Table not exist') || msg.includes('-502005')
    if (!notExist) throw error
    if (typeof db.createCollection === 'function') {
      await db.createCollection('search_logs')
      return
    }
    throw new Error('search_logs 集合不存在，请先在云开发控制台创建')
  })
}

function normalizeSearchScope(value) {
  const s = normalizeText(value, 20).toLowerCase()
  return ['all', 'product', 'service', 'shop'].includes(s) ? s : 'all'
}

function normalizeSearchKeyword(value) {
  const text = normalizeText(value, 60)
  return text.replace(/\s+/g, ' ').trim()
}

async function trackSearchKeyword(openid, event) {
  await ensureSearchLogsCollection()
  const keyword = normalizeSearchKeyword(event?.keyword)
  if (!keyword) return success({ tracked: false })
  const scope = normalizeSearchScope(event?.scope)
  const merchantId = normalizeMerchantId(event?.merchantId)
  await db.collection('search_logs').add({
    data: {
      keyword,
      scope,
      merchantId: merchantId || '',
      openid: String(openid || ''),
      createTime: db.serverDate()
    }
  }).catch(() => null)
  return success({ tracked: true })
}

async function getHotSearchKeywords(event) {
  await ensureSearchLogsCollection()
  const limit = Math.max(1, Math.min(12, Math.floor(Number(event?.limit || 8))))
  const days = Math.max(1, Math.min(30, Math.floor(Number(event?.days || 7))))
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000
  const scope = normalizeSearchScope(event?.scope)
  const match = {
    createTime: db.command.gte(new Date(sinceMs))
  }
  if (scope !== 'all') match.scope = scope

  try {
    const agg = await db.collection('search_logs')
      .aggregate()
      .match(match)
      .group({
        _id: '$keyword',
        count: db.command.aggregate.sum(1),
        lastTime: db.command.aggregate.max('$createTime')
      })
      .sort({ count: -1 })
      .limit(limit)
      .end()
    const rows = (agg && agg.list) ? agg.list : []
    const list = rows
      .map((r) => ({
        keyword: String(r && r._id != null ? r._id : '').trim(),
        count: Number(r && r.count != null ? r.count : 0)
      }))
      .filter((r) => !!r.keyword)
    return success({ list, days, scope })
  } catch (e) {
    console.warn('[system] getHotSearchKeywords aggregate failed', e && e.message)
    return success({ list: [], days, scope })
  }
}

function normalizeBannerSortValue(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.trunc(Math.min(1000000, Math.max(-1000000, n)))
}

function normalizeBannerTargetType(value) {
  const t = normalizeText(value, 24).toLowerCase() || 'none'
  const ok = ['none', 'product', 'service', 'shop', 'path', 'page']
  return ok.includes(t) ? t : 'none'
}

function buildBannerWritePayload(raw) {
  const startTime = normalizeText(raw.startTime, 40)
  const endTime = normalizeText(raw.endTime, 40)
  return {
    imageUrl: normalizeText(raw.imageUrl, 2048),
    title: normalizeText(raw.title, 80),
    subTitle: normalizeText(raw.subTitle, 120),
    targetType: normalizeBannerTargetType(raw.targetType),
    targetValue: normalizeText(raw.targetValue, 500),
    targetPath: normalizeText(raw.targetPath, 500),
    sortOrder: normalizeBannerSortValue(raw.sortOrder),
    enabled: normalizeBool(raw.enabled, true),
    startTime: startTime || '',
    endTime: endTime || ''
  }
}

function validateBannerWritePayload(p) {
  if (!p.imageUrl) return fail(422, '图片地址不能为空')
  return null
}

/** 与后台列表一致：仅明确为 false 时视为下架，缺省字段视为上架 */
function isBannerRowEnabledForPublic(row) {
  return row && row.enabled !== false
}

/** 解析轮播生效时间（兼容 iOS 对「2026-04-01 12:00」类字符串的解析差异） */
function parseBannerTimeMs(v) {
  if (v == null || v === '') return null
  const s = String(v).trim()
  const normalized = s.includes('T') ? s : s.replace(/-/g, '/')
  const t = new Date(normalized).getTime()
  return Number.isFinite(t) ? t : null
}

function isBannerWithinTimeWindow(row, nowMs) {
  const st = parseBannerTimeMs(row.startTime)
  const et = parseBannerTimeMs(row.endTime)
  if (st != null && nowMs < st) return false
  if (et != null && nowMs > et) return false
  return true
}

/** 用户端首页轮播列表（无需管理员权限） */
async function buildHomeBannersPublicList() {
  const nowMs = Date.now()
  const res = await db.collection('banners').limit(100).get().catch(() => ({ data: [] }))
  const rows = Array.isArray(res.data) ? res.data : []
  const filtered = rows
    .filter((row) => isBannerRowEnabledForPublic(row))
    .filter((row) => isBannerWithinTimeWindow(row, nowMs))
    .sort((a, b) => {
      const sa = Number(a.sortOrder)
      const sb = Number(b.sortOrder)
      const na = Number.isFinite(sa) ? sa : 0
      const nb = Number.isFinite(sb) ? sb : 0
      return na - nb
    })
    .slice(0, 30)
  const list = filtered
    .map((doc) => ({
      id: doc._id,
      imageUrl: String(doc.imageUrl || '').trim(),
      title: String(doc.title || '').trim(),
      subTitle: String(doc.subTitle || '').trim(),
      targetType: String(doc.targetType || 'none').trim() || 'none',
      targetValue: String(doc.targetValue != null ? doc.targetValue : '').trim(),
      targetPath: String(doc.targetPath != null ? doc.targetPath : '').trim()
    }))
    .filter((item) => !!item.imageUrl)
  return { list }
}

const LOGIN_RATE_LIMIT = {
  MAX_ATTEMPTS: 5,
  WINDOW_MS: 15 * 60 * 1000,
  LOCKOUT_MS: 15 * 60 * 1000
}

async function checkLoginRateLimit(username) {
  try {
    const rateLimitKey = `admin_login_${username}`
    const res = await db.collection('system_settings').where({ key: rateLimitKey }).limit(1).get().catch(() => null)
    const record = res && res.data && res.data[0]
    if (!record) return { blocked: false }

    const { failedAttempts = 0, lastFailTime = 0, lockoutUntil = 0 } = record
    const now = Date.now()

    if (lockoutUntil > now) {
      const remainingSeconds = Math.ceil((lockoutUntil - now) / 1000)
      return { blocked: true, message: `登录失败次数过多，请 ${remainingSeconds} 秒后重试` }
    }

    if (now - lastFailTime > LOGIN_RATE_LIMIT.WINDOW_MS) {
      return { blocked: false }
    }

    if (failedAttempts >= LOGIN_RATE_LIMIT.MAX_ATTEMPTS) {
      const lockUntil = now + LOGIN_RATE_LIMIT.LOCKOUT_MS
      await db.collection('system_settings').doc(record._id).update({
        data: { lockoutUntil: lockUntil }
      }).catch(() => null)
      return { blocked: true, message: `登录失败次数过多，请 ${Math.ceil(LOGIN_RATE_LIMIT.LOCKOUT_MS / 1000)} 秒后重试` }
    }

    return { blocked: false }
  } catch (e) {
    console.error('[system] checkLoginRateLimit error:', e)
    return { blocked: false }
  }
}

async function recordLoginFailure(username) {
  try {
    const rateLimitKey = `admin_login_${username}`
    const now = Date.now()

    const res = await db.collection('system_settings').where({ key: rateLimitKey }).limit(1).get().catch(() => null)
    const record = res && res.data && res.data[0]

    if (!record) {
      await db.collection('system_settings').add({
        data: {
          key: rateLimitKey,
          failedAttempts: 1,
          lastFailTime: now,
          lockoutUntil: 0,
          createdAt: new Date()
        }
      }).catch(() => null)
    } else {
      const { failedAttempts = 0, lastFailTime = 0 } = record
      const isWithinWindow = (now - lastFailTime) < LOGIN_RATE_LIMIT.WINDOW_MS

      await db.collection('system_settings').doc(record._id).update({
        data: {
          failedAttempts: isWithinWindow ? failedAttempts + 1 : 1,
          lastFailTime: now,
          lockoutUntil: 0
        }
      }).catch(() => null)
    }
  } catch (e) {
    console.error('[system] recordLoginFailure error:', e)
  }
}

async function clearLoginFailures(username) {
  try {
    const rateLimitKey = `admin_login_${username}`
    const res = await db.collection('system_settings').where({ key: rateLimitKey }).limit(1).get().catch(() => null)
    const record = res && res.data && res.data[0]
    if (record) {
      await db.collection('system_settings').doc(record._id).remove().catch(() => null)
    }
  } catch (e) {
    console.error('[system] clearLoginFailures error:', e)
  }
}

async function getDashboardStats() {
  const now = Date.now()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayStartMs = todayStart.getTime()
  const todayEndMs = todayStartMs + 86400000

  const counts = {}
  const countCollections = ['users', 'merchants', 'products', 'services', 'orders', 'bookings', 'reviews']
  await Promise.all(countCollections.map(async (name) => {
    try {
      const r = await db.collection(name).count()
      counts[name] = Number(r.total || 0)
    } catch (_) {
      counts[name] = 0
    }
  }))

  let todayOrders = 0
  let todayOrderAmount = 0
  try {
    const oRes = await db.collection('orders')
      .where({ createTime: db.command.and(db.command.gte(new Date(todayStartMs)), db.command.lt(new Date(todayEndMs))) })
      .limit(1000)
      .field({ totalAmount: true })
      .get()
    const oList = Array.isArray(oRes.data) ? oRes.data : []
    todayOrders = oList.length
    todayOrderAmount = oList.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0)
  } catch (_) {}

  let todayBookings = 0
  try {
    const bRes = await db.collection('bookings')
      .where({ createTime: db.command.and(db.command.gte(new Date(todayStartMs)), db.command.lt(new Date(todayEndMs))) })
      .limit(1000)
      .get()
    todayBookings = Array.isArray(bRes.data) ? bRes.data.length : 0
  } catch (_) {}

  let pendingRefunds = 0
  try {
    const rRes = await db.collection('payment_refunds')
      .where({ status: 'processing' })
      .limit(1)
      .count()
    pendingRefunds = Number(rRes.total || 0)
  } catch (_) {}

  let pendingWithdrawals = 0
  try {
    const wRes = await db.collection('merchant_withdrawals')
      .where({ status: 'pending' })
      .limit(1)
      .count()
    pendingWithdrawals = Number(wRes.total || 0)
  } catch (_) {}

  let activeMerchants = 0
  try {
    const mRes = await db.collection('merchants')
      .where({ status: 'active' })
      .limit(1)
      .count()
    activeMerchants = Number(mRes.total || 0)
  } catch (_) {}

  return {
    totals: {
      users: counts.users,
      merchants: counts.merchants,
      activeMerchants,
      products: counts.products,
      services: counts.services,
      orders: counts.orders,
      bookings: counts.bookings,
      reviews: counts.reviews
    },
    today: {
      orders: todayOrders,
      orderAmount: todayOrderAmount,
      bookings: todayBookings
    },
    pending: {
      refunds: pendingRefunds,
      withdrawals: pendingWithdrawals
    }
  }
}

exports.main = async (event) => {
  const action = String(event?.action || '')
  try {
    // 用户端首页轮播（与独立云函数 getHomeBanners 逻辑一致，便于只部署 system 的环境）
    if (action === 'getHomeBanners') {
      await ensureBannersCollection()
      return success(await buildHomeBannersPublicList())
    }

    // 搜索热词：用户端无需登录
    if (action === 'trackSearchKeyword') {
      const wxContext = cloud.getWXContext()
      return await trackSearchKeyword(String(wxContext.OPENID || ''), event)
    }
    if (action === 'getHotSearchKeywords') {
      return await getHotSearchKeywords(event)
    }

    // 首页轮播管理（独立集合 banners，仅管理员）
    if (action === 'adminListBanners' || action === 'adminUpsertBanner' || action === 'adminDeleteBanner') {
      await ensureBannersCollection()
      const wxContext = cloud.getWXContext()
      const gate = await assertOpenidIsAdmin(String(wxContext.OPENID || ''), event.adminToken)
      if (gate) return gate

      if (action === 'adminListBanners') {
        const res = await db.collection('banners').get()
        const list = (res.data || [])
          .map((doc) => ({
            _id: doc._id,
            imageUrl: String(doc.imageUrl || ''),
            title: String(doc.title || ''),
            subTitle: String(doc.subTitle || ''),
            targetType: String(doc.targetType || 'none'),
            targetValue: String(doc.targetValue || ''),
            targetPath: String(doc.targetPath || ''),
            sortOrder: Number(doc.sortOrder) || 0,
            enabled: doc.enabled !== false,
            startTime: doc.startTime != null ? String(doc.startTime) : '',
            endTime: doc.endTime != null ? String(doc.endTime) : ''
          }))
          .sort((a, b) => a.sortOrder - b.sortOrder)
        return success({ list })
      }

      if (action === 'adminUpsertBanner') {
        const raw = (event && event.banner && typeof event.banner === 'object') ? event.banner : {}
        const payload = buildBannerWritePayload(raw)
        const err = validateBannerWritePayload(payload)
        if (err) return err
        const id = normalizeText(raw._id, 32)
        if (id) {
          await db.collection('banners').doc(id).update({
            data: {
              ...payload,
              updateTime: db.serverDate()
            }
          })
          return success({ id, updated: true })
        }
        const addRes = await db.collection('banners').add({
          data: {
            ...payload,
            createTime: db.serverDate(),
            updateTime: db.serverDate()
          }
        })
        return success({ id: addRes._id, created: true })
      }

      if (action === 'adminDeleteBanner') {
        const id = normalizeText(event.bannerId || event._id, 32)
        if (!id) return fail(422, '缺少 bannerId')
        await db.collection('banners').doc(id).remove()
        return success({ deleted: true, id })
      }
    }

    await ensureSettingsCollection()
    if (action === 'getContactConfig') {
      const docId = 'contact'
      const res = await db.collection('system_settings').doc(docId).get().catch(() => null)
      const data = res && res.data ? res.data : null

      if (!data) {
        return success({
          serviceHours: '周一至周日 09:00-21:00',
          supportWechat: '待管理员配置',
          supportEmail: '待管理员配置',
          contacts: buildDefaultContacts(),
          source: 'default'
        })
      }

      return success({
        serviceHours: String(data.serviceHours || '周一至周日 09:00-21:00'),
        supportWechat: String(data.supportWechat || '待管理员配置'),
        supportEmail: String(data.supportEmail || '待管理员配置'),
        contacts: Array.isArray(data.contacts) && data.contacts.length > 0
          ? data.contacts
          : buildDefaultContacts(),
        source: 'cloud'
      })
    }

    if (action === 'setContactConfig') {
      const wxContext = cloud.getWXContext()
      const gate = await assertOpenidIsAdmin(String(wxContext.OPENID || ''), event.adminToken)
      if (gate) return gate
      const saved = await saveContactConfig(event)
      return success({
        saved: true,
        serviceHours: saved.serviceHours,
        supportWechat: saved.supportWechat,
        supportEmail: saved.supportEmail,
        contacts: saved.contacts
      })
    }

    if (action === 'getPayConfig') {
      const wxContext = cloud.getWXContext()
      const gate = await assertOpenidIsAdmin(String(wxContext.OPENID || ''), event.adminToken)
      if (gate) return gate
      const data = await getDocOrNull('pay_config')
      const decrypted = decryptSensitiveFields(data)
      const payload = buildPayConfigPayload(decrypted)
      const masked = maskSensitiveFields(payload)
      return success({
        ...masked,
        readiness: buildPayReadiness(payload)
      })
    }

    if (action === 'setPayConfig') {
      const wxContext = cloud.getWXContext()
      const gate = await assertOpenidIsAdmin(String(wxContext.OPENID || ''), event.adminToken)
      if (gate) return gate

      const oldData = await getDocOrNull('pay_config')
      const oldDecrypted = decryptSensitiveFields(oldData)
      const oldPayload = buildPayConfigPayload(oldDecrypted)

      const restoredEvent = restoreSensitiveFromOld(event, oldPayload)
      const saved = await savePayConfig(restoredEvent)
      const changes = []
      const compareFields = ['payMode', 'appId', 'serviceProviderMchId', 'merchantSerialNo', 'notifyUrl', 'merchantApplyStatus', 'defaultSettlementMode', 'subMerchantIdSource', 'subMerchantFieldName', 'refundEnabled', 'profitSharingEnabled', 'transferEnabled']
      for (const f of compareFields) {
        if (String(oldPayload[f] || '') !== String(saved[f] || '')) {
          changes.push({ field: f, from: oldPayload[f], to: saved[f] })
        }
      }
      const sensitiveChanged = SENSITIVE_FIELDS.filter(f => {
        const oldVal = oldPayload[f] || ''
        const newVal = event[f] || ''
        return oldVal !== newVal && newVal !== '***'
      })
      for (const f of sensitiveChanged) {
        changes.push({ field: f, from: '(已配置)', to: '(已更新)' })
      }

      try {
        const adminOpenid = String(wxContext.OPENID || '')
        await db.collection('admin_operation_logs').add({
          data: {
            type: 'pay_config_change',
            operatorOpenid: adminOpenid,
            changes,
            changeCount: changes.length,
            payMode: saved.payMode,
            readiness: buildPayReadiness(saved),
            createTime: db.serverDate()
          }
        })
      } catch (_) {}

      const maskedSaved = maskSensitiveFields(saved)
      return success({
        saved: true,
        ...maskedSaved,
        readiness: buildPayReadiness(saved)
      })
    }

    if (action === 'getPayConfigLogs') {
      const wxContext = cloud.getWXContext()
      const gate = await assertOpenidIsAdmin(String(wxContext.OPENID || ''), event.adminToken)
      if (gate) return gate
      const page = Math.max(1, Number(event.page || 1))
      const pageSize = Math.max(1, Math.min(50, Number(event.pageSize || 20)))
      const skip = (page - 1) * pageSize
      const [countRes, listRes] = await Promise.all([
        db.collection('admin_operation_logs').where({ type: 'pay_config_change' }).count(),
        db.collection('admin_operation_logs').where({ type: 'pay_config_change' })
          .orderBy('createTime', 'desc').skip(skip).limit(pageSize).get()
      ])
      const total = countRes.total || 0
      const list = (listRes.data || []).map(log => ({
        _id: log._id,
        operatorOpenid: log.operatorOpenid,
        changes: log.changes || [],
        changeCount: log.changeCount || 0,
        payMode: log.payMode || '',
        readiness: log.readiness || null,
        createTime: log.createTime
      }))
      return success({ list, total, page, pageSize, hasMore: skip + list.length < total })
    }

    if (action === 'testPayConfigConnection') {
      const wxContext = cloud.getWXContext()
      const gate = await assertOpenidIsAdmin(String(wxContext.OPENID || ''), event.adminToken)
      if (gate) return gate
      const data = await getDocOrNull('pay_config')
      const decrypted = decryptSensitiveFields(data)
      const config = buildPayConfigPayload(decrypted)
      const readiness = buildPayReadiness(config)
      const results = []

      results.push({ item: '支付模式', status: config.payMode === 'live' ? 'pass' : 'warn', detail: config.payMode === 'live' ? '正式模式' : '模拟模式' })

      if (config.appId) {
        results.push({ item: 'AppId', status: 'pass', detail: config.appId })
      } else {
        results.push({ item: 'AppId', status: 'fail', detail: '未配置' })
      }

      if (config.serviceProviderMchId) {
        results.push({ item: '服务商商户号', status: 'pass', detail: config.serviceProviderMchId })
      } else {
        results.push({ item: '服务商商户号', status: 'fail', detail: '未配置' })
      }

      if (config.notifyUrl) {
        const urlOk = /^https?:\/\/.+/.test(config.notifyUrl)
        results.push({ item: '支付回调地址', status: urlOk ? 'pass' : 'warn', detail: urlOk ? '格式正确' : '地址格式可能不正确' })
      } else {
        results.push({ item: '支付回调地址', status: 'fail', detail: '未配置' })
      }

      results.push({ item: 'APIv3 密钥', status: config.apiV3KeyConfigured ? 'pass' : 'fail', detail: config.apiV3KeyConfigured ? '已配置' : '未配置' })
      results.push({ item: '商户 API 证书', status: config.apiClientCertConfigured ? 'pass' : 'fail', detail: config.apiClientCertConfigured ? '已配置' : '未配置' })
      results.push({ item: '商户 API 私钥', status: config.apiClientKeyConfigured ? 'pass' : 'fail', detail: config.apiClientKeyConfigured ? '已配置' : '未配置' })
      results.push({ item: '平台证书', status: config.platformCertConfigured ? 'pass' : 'fail', detail: config.platformCertConfigured ? '已配置' : '未配置' })

      if (config.merchantSerialNo) {
        results.push({ item: '证书序列号', status: 'pass', detail: config.merchantSerialNo.slice(0, 8) + '***' })
      } else {
        results.push({ item: '证书序列号', status: 'fail', detail: '未配置' })
      }

      const encryptStatus = getEncryptKey() ? 'pass' : 'warn'
      results.push({ item: '敏感数据加密', status: encryptStatus, detail: getEncryptKey() ? 'AES-256-CBC 已启用' : '未配置加密密钥（明文存储）' })

      const passCount = results.filter(r => r.status === 'pass').length
      const failCount = results.filter(r => r.status === 'fail').length
      const warnCount = results.filter(r => r.status === 'warn').length
      const overallStatus = failCount === 0 ? (warnCount === 0 ? 'healthy' : 'warning') : 'error'

      return success({
        overall: overallStatus,
        readyForJsapi: readiness.readyForJsapi,
        results,
        summary: { pass: passCount, fail: failCount, warn: warnCount, total: results.length }
      })
    }

    if (action === 'getHomeNotice') {
      const data = await getDocOrNull('home_notice')
      return success(buildNoticePayload(data))
    }

    if (action === 'getHomeNoticeAdmin') {
      const wxContext = cloud.getWXContext()
      const gate = await assertOpenidIsAdmin(String(wxContext.OPENID || ''), event.adminToken)
      if (gate) return gate
      const data = await getDocOrNull('home_notice')
      return success(buildNoticeAdminPayload(data))
    }

    if (action === 'getMerchantNotice') {
      const merchantId = normalizeMerchantId(event?.merchantId)
      if (!merchantId) return fail(422, 'merchantId 不能为空')
      const data = await getDocOrNull(`merchant_notice_${merchantId}`)
      return success(buildNoticePayload(data))
    }

    if (action === 'getMerchantNoticeAdmin') {
      const wxContext = cloud.getWXContext()
      const openid = String(wxContext.OPENID || '')
      if (!openid) return fail(401, '未登录')
      const merchantId = normalizeMerchantId(event?.merchantId)
      if (!merchantId) return fail(422, 'merchantId 不能为空')
      const admin = await isOpenidAdmin(openid)
      if (!admin && !(await canOpenidManageMerchant(db, openid, merchantId))) {
        return fail(403, '无权管理该商户公告')
      }
      const data = await getDocOrNull(`merchant_notice_${merchantId}`)
      return success(buildNoticeAdminPayload(data))
    }

    if (action === 'setHomeNotice') {
      const wxContext = cloud.getWXContext()
      const gate = await assertOpenidIsAdmin(String(wxContext.OPENID || ''), event.adminToken)
      if (gate) return gate
      const enabled = normalizeBool(event?.enabled, true)
      const noticeItems = buildWritableNoticeList(event)
      const validationError = validateWritableNoticeList(noticeItems)
      if (validationError) return validationError
      const saved = await saveNoticeConfig('home_notice', enabled, noticeItems)
      return success({ saved: true, enabled: saved.enabled, count: saved.notices.length })
    }

    if (action === 'setMerchantNotice') {
      const wxContext = cloud.getWXContext()
      const openid = String(wxContext.OPENID || '')
      if (!openid) return fail(401, '未登录')
      const merchantId = normalizeMerchantId(event?.merchantId)
      if (!merchantId) return fail(422, 'merchantId 不能为空')
      const admin = await isOpenidAdmin(openid)
      if (!admin && !(await canOpenidManageMerchant(db, openid, merchantId))) {
        return fail(403, '无权管理该商户公告')
      }
      const enabled = normalizeBool(event?.enabled, true)
      const noticeItems = buildWritableNoticeList(event)
      const validationError = validateWritableNoticeList(noticeItems)
      if (validationError) return validationError
      const saved = await saveNoticeConfig(`merchant_notice_${merchantId}`, enabled, noticeItems)
      return success({ saved: true, merchantId, enabled: saved.enabled, count: saved.notices.length })
    }

    if (action === 'getDashboardStats') {
      const wxContext = cloud.getWXContext()
      const gate = await assertOpenidIsAdmin(String(wxContext.OPENID || ''), event.adminToken)
      if (gate) return gate
      return success(await getDashboardStats())
    }

    if (action === 'getDashboardTrend') {
      const wxContext = cloud.getWXContext()
      const gate = await assertOpenidIsAdmin(String(wxContext.OPENID || ''), event.adminToken)
      if (gate) return gate
      return success(await getDashboardTrend(event))
    }

    if (action === 'adminLogin') {
      const username = String(event.username || '').trim()
      const password = String(event.password || '').trim()
      if (!username || !password) return fail(422, '请输入用户名和密码')

      const rateLimitResult = await checkLoginRateLimit(username)
      if (rateLimitResult.blocked) {
        return fail(429, rateLimitResult.message)
      }

      const configRes = await db.collection('system_settings').where({ key: 'admin_config' }).limit(1).get().catch(() => null)
      const config = configRes && configRes.data && configRes.data[0]
      if (!config) return fail(500, '管理员配置未初始化')
      const storedHash = config.passwordHash || ''
      const inputHash = sha256(password)
      if (config.username !== username || storedHash !== inputHash) {
        await recordLoginFailure(username)
        return fail(401, '用户名或密码错误')
      }
      await clearLoginFailures(username)
      const adminRole = config.adminRole || 'admin'
      const adminUser = await db.collection('users').where({ role: 'admin' }).limit(1).get().catch(() => null)
      const adminOpenid = (adminUser && adminUser.data && adminUser.data[0]) ? adminUser.data[0]._openid : ''
      const token = await createAdminSession(db, adminOpenid, username, adminRole)
      return success({ token, username, role: adminRole })
    }

    if (action === 'adminListUsers') {
      const wxContext = cloud.getWXContext()
      const gate = await assertOpenidIsAdmin(String(wxContext.OPENID || ''), event.adminToken)
      if (gate) return gate
      const page = Math.max(1, Number(event.page || 1))
      const pageSize = Math.max(1, Math.min(50, Number(event.pageSize || 20)))
      const roleFilter = String(event.roleFilter || 'all').trim()
      const banFilter = String(event.banFilter || 'all').trim()
      const keyword = String(event.keyword || '').trim()
      const where = {}
      if (roleFilter !== 'all') where.role = roleFilter
      if (banFilter === 'banned') where.banStatus = 'banned'
      if (banFilter === 'active') where.banStatus = _.neq('banned')
      if (keyword) {
        const kw = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        where.nickName = db.RegExp({ regexp: kw, options: 'i' })
      }
      const countRes = await db.collection('users').where(where).count()
      const total = countRes.total || 0
      const skip = (page - 1) * pageSize
      const listRes = await db.collection('users').where(where)
        .orderBy('createTime', 'desc')
        .skip(skip).limit(pageSize)
        .field({ _id: true, _openid: true, nickName: true, nickname: true, avatarUrl: true, role: true, gender: true, city: true, lastLoginTime: true, createTime: true, banStatus: true, banReason: true, banTime: true, banExpiry: true })
        .get()
      const list = (listRes.data || []).map(u => ({
        ...u,
        nickName: u.nickName || u.nickname || '',
        isBanned: u.banStatus === 'banned'
      }))
      return success({ list, total, page, pageSize, hasMore: skip + list.length < total })
    }

    if (action === 'adminChangeUserRole') {
      const wxContext = cloud.getWXContext()
      const gate = await assertOpenidIsAdmin(String(wxContext.OPENID || ''), event.adminToken)
      if (gate) return gate
      const targetUserId = String(event.targetUserId || '').trim()
      const newRole = String(event.newRole || '').trim()
      const reason = String(event.reason || '').trim()
      if (!targetUserId) return fail(422, 'targetUserId 不能为空')
      const validRoles = ['user', 'merchant', 'admin']
      if (!validRoles.includes(newRole)) return fail(422, `newRole 不合法，允许值: ${validRoles.join(', ')}`)
      if (!reason || reason.length < 2) return fail(422, '变更原因至少填写 2 个字')

      const uRes = await db.collection('users').doc(targetUserId).get().catch(() => null)
      if (!uRes || !uRes.data) return fail(404, '用户不存在')
      const targetUser = uRes.data
      const oldRole = targetUser.role || 'user'
      if (oldRole === newRole) return fail(422, '新角色与当前角色相同，无需变更')

      const adminOpenid = String(wxContext.OPENID || '')
      if (targetUser._openid === adminOpenid) return fail(422, '不允许变更自己的角色')

      await db.collection('users').doc(targetUserId).update({
        data: {
          role: newRole,
          roleChangeTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })

      try {
        await db.collection('admin_operation_logs').add({
          data: {
            type: 'role_change',
            operatorOpenid: adminOpenid,
            targetUserId,
            targetOpenid: targetUser._openid,
            targetNickname: targetUser.nickName || targetUser.nickname || '',
            oldRole,
            newRole,
            reason,
            createTime: db.serverDate()
          }
        })
      } catch (_) {}

      return success({ userId: targetUserId, oldRole, newRole })
    }

    if (action === 'adminBanUser') {
      const wxContext = cloud.getWXContext()
      const gate = await assertOpenidIsAdmin(String(wxContext.OPENID || ''), event.adminToken)
      if (gate) return gate
      const targetUserId = String(event.targetUserId || '').trim()
      const reason = String(event.reason || '').trim()
      const duration = String(event.duration || 'permanent').trim()
      if (!targetUserId) return fail(422, 'targetUserId 不能为空')
      if (!reason || reason.length < 4) return fail(422, '禁用原因至少填写 4 个字')

      const uRes = await db.collection('users').doc(targetUserId).get().catch(() => null)
      if (!uRes || !uRes.data) return fail(404, '用户不存在')
      const targetUser = uRes.data
      if (targetUser.banStatus === 'banned') return fail(422, '该用户已被禁用')

      const adminOpenid = String(wxContext.OPENID || '')
      if (targetUser._openid === adminOpenid) return fail(422, '不允许禁用自己的账号')

      let banExpiry = null
      if (duration === '1d') banExpiry = new Date(Date.now() + 86400000)
      else if (duration === '7d') banExpiry = new Date(Date.now() + 7 * 86400000)
      else if (duration === '30d') banExpiry = new Date(Date.now() + 30 * 86400000)
      else if (duration === '90d') banExpiry = new Date(Date.now() + 90 * 86400000)

      const updateData = {
        banStatus: 'banned',
        banReason: reason,
        banDuration: duration,
        banTime: db.serverDate(),
        updateTime: db.serverDate()
      }
      if (banExpiry) updateData.banExpiry = banExpiry

      await db.collection('users').doc(targetUserId).update({ data: updateData })

      try {
        await db.collection('admin_operation_logs').add({
          data: {
            type: 'user_ban',
            operatorOpenid: adminOpenid,
            targetUserId,
            targetOpenid: targetUser._openid,
            targetNickname: targetUser.nickName || targetUser.nickname || '',
            reason,
            duration,
            banExpiry: banExpiry || null,
            createTime: db.serverDate()
          }
        })
      } catch (_) {}

      return success({ userId: targetUserId, banStatus: 'banned', duration })
    }

    if (action === 'adminUnbanUser') {
      const wxContext = cloud.getWXContext()
      const gate = await assertOpenidIsAdmin(String(wxContext.OPENID || ''), event.adminToken)
      if (gate) return gate
      const targetUserId = String(event.targetUserId || '').trim()
      const reason = String(event.reason || '').trim()
      if (!targetUserId) return fail(422, 'targetUserId 不能为空')
      if (!reason || reason.length < 2) return fail(422, '解封原因至少填写 2 个字')

      const uRes = await db.collection('users').doc(targetUserId).get().catch(() => null)
      if (!uRes || !uRes.data) return fail(404, '用户不存在')
      const targetUser = uRes.data
      if (targetUser.banStatus !== 'banned') return fail(422, '该用户未被禁用')

      const adminOpenid = String(wxContext.OPENID || '')

      await db.collection('users').doc(targetUserId).update({
        data: {
          banStatus: 'active',
          banReason: _.remove(),
          banDuration: _.remove(),
          banTime: _.remove(),
          banExpiry: _.remove(),
          unbanTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })

      try {
        await db.collection('admin_operation_logs').add({
          data: {
            type: 'user_unban',
            operatorOpenid: adminOpenid,
            targetUserId,
            targetOpenid: targetUser._openid,
            targetNickname: targetUser.nickName || targetUser.nickname || '',
            reason,
            createTime: db.serverDate()
          }
        })
      } catch (_) {}

      return success({ userId: targetUserId, banStatus: 'active' })
    }

    if (action === 'adminBatchBanUsers') {
      const wxContext = cloud.getWXContext()
      const gate = await assertOpenidIsAdmin(String(wxContext.OPENID || ''), event.adminToken)
      if (gate) return gate
      const userIds = Array.isArray(event.userIds) ? event.userIds.filter(Boolean) : []
      const reason = String(event.reason || '').trim()
      const duration = String(event.duration || 'permanent').trim()
      if (!userIds.length) return fail(422, 'userIds 不能为空')
      if (userIds.length > 20) return fail(422, '单次批量操作不超过 20 个用户')
      if (!reason || reason.length < 4) return fail(422, '禁用原因至少填写 4 个字')

      const adminOpenid = String(wxContext.OPENID || '')
      let successCount = 0
      const errors = []

      let banExpiry = null
      if (duration === '1d') banExpiry = new Date(Date.now() + 86400000)
      else if (duration === '7d') banExpiry = new Date(Date.now() + 7 * 86400000)
      else if (duration === '30d') banExpiry = new Date(Date.now() + 30 * 86400000)
      else if (duration === '90d') banExpiry = new Date(Date.now() + 90 * 86400000)

      for (const uid of userIds) {
        try {
          const uRes = await db.collection('users').doc(uid).get().catch(() => null)
          if (!uRes || !uRes.data) { errors.push({ userId: uid, error: '用户不存在' }); continue }
          const u = uRes.data
          if (u.banStatus === 'banned') { errors.push({ userId: uid, error: '已被禁用' }); continue }
          if (u._openid === adminOpenid) { errors.push({ userId: uid, error: '不能禁用自己' }); continue }

          const updateData = { banStatus: 'banned', banReason: reason, banDuration: duration, banTime: db.serverDate(), updateTime: db.serverDate() }
          if (banExpiry) updateData.banExpiry = banExpiry
          await db.collection('users').doc(uid).update({ data: updateData })

          try {
            await db.collection('admin_operation_logs').add({
              data: { type: 'user_ban', operatorOpenid: adminOpenid, targetUserId: uid, targetOpenid: u._openid, targetNickname: u.nickName || u.nickname || '', reason, duration, banExpiry: banExpiry || null, createTime: db.serverDate() }
            })
          } catch (_) {}
          successCount++
        } catch (e) {
          errors.push({ userId: uid, error: e.message || '操作失败' })
        }
      }

      return success({ successCount, errors, total: userIds.length })
    }

    return fail(422, '无效的 action，支持 adminListUsers / adminChangeUserRole / adminBanUser / adminUnbanUser / adminBatchBanUsers 等')
  } catch (error) {
    console.error('[system] 执行失败', error)
    return fail(500, `执行失败: ${error.message || '未知错误'}`)
  }
}
