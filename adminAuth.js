const crypto = require('crypto')

const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const SESSION_COLLECTION = 'admin_sessions'

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex')
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex')
}

async function verifyAdminToken(db, token) {
  if (!token) return null
  try {
    const tokenHash = sha256(token)
    const res = await db.collection(SESSION_COLLECTION).doc(tokenHash).get().catch(() => null)
    if (!res || !res.data) return null
    const session = res.data
    if (Date.now() > session.expiresAt) {
      await db.collection(SESSION_COLLECTION).doc(tokenHash).remove().catch(() => null)
      return null
    }
    return { openid: session.openid, username: session.username, role: session.role || 'admin' }
  } catch (e) {
    console.error('[adminAuth] verifyAdminToken error:', e)
    return null
  }
}

async function createAdminSession(db, openid, username, role) {
  const token = generateToken()
  const tokenHash = sha256(token)
  const expiresAt = Date.now() + SESSION_TTL_MS
  await db.collection(SESSION_COLLECTION).doc(tokenHash).set({
    data: {
      openid,
      username,
      role: role || 'admin',
      expiresAt,
      createdAt: db.serverDate()
    }
  })
  cleanupExpiredSessions(db).catch(() => null)
  return token
}

async function cleanupExpiredSessions(db) {
  try {
    const now = Date.now()
    const expired = await db.collection(SESSION_COLLECTION)
      .where({ expiresAt: db.command.lt(now) })
      .limit(50)
      .get()
    if (expired.data && expired.data.length) {
      const batch = db.collection(SESSION_COLLECTION)
      for (const doc of expired.data) {
        await batch.doc(doc._id).remove().catch(() => null)
      }
    }
  } catch (e) {
    console.error('[adminAuth] cleanupExpiredSessions error:', e)
  }
}

async function assertAdminAuth(db, openid, adminToken) {
  if (openid) {
    try {
      const uRes = await db.collection('users').where({ _openid: openid }).limit(1).get()
      if (uRes.data && uRes.data[0] && uRes.data[0].role === 'admin') {
        return { ok: true, source: 'openid', openid, role: uRes.data[0].adminRole || 'admin' }
      }
    } catch (e) { /* ignore */ }
  }
  if (adminToken) {
    const session = await verifyAdminToken(db, adminToken)
    if (session) {
      return { ok: true, source: 'token', openid: session.openid, role: session.role || 'admin' }
    }
  }
  return { ok: false }
}

module.exports = { sha256, generateToken, verifyAdminToken, createAdminSession, assertAdminAuth, SESSION_TTL_MS }
