/**
 * 判断 openid 是否可管理该店铺：仅允许已开通店铺的店主或有效关系表成员访问。
 *
 * 关键约束：
 * 1. 店铺必须处于 approved，停用/下线店铺不可继续经营。
 * 2. 不再仅凭 users.role=merchant 放行，避免越权访问任意店铺。
 *
 * 单源文件：修改后请运行项目根目录 `node scripts/sync-merchant-access.js` 同步到各云函数目录后再上传部署。
 */
async function canOpenidManageMerchant(db, openid, merchantId) {
  const mid = String(merchantId || '').trim()
  if (!mid || !openid) return false
  const mDoc = await db.collection('merchants').doc(mid).get().catch(() => null)
  const m = mDoc && mDoc.data
  if (!m) return false
  if (String(m.status || '').trim().toLowerCase() !== 'approved') return false
  if (String(m.ownerOpenid || '') === openid) return true
  const relRes = await db
    .collection('user_shop_relations')
    .where({ _openid: openid, merchantId: mid, status: 'active' })
    .limit(1)
    .get()
    .catch(() => null)
  if (relRes && relRes.data && relRes.data.length) return true
  return false
}

module.exports = { canOpenidManageMerchant }
