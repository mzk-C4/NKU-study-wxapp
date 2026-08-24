const STORAGE_KEY = 'nkustudy_auth_session'
// Accept RFC 6750-compatible bearer tokens, including JWTs (which contain dots),
// while rejecting whitespace/control characters before placing the value in a header.
const TOKEN_PATTERN = /^[A-Za-z0-9._~+\/-]{16,2048}={0,2}$/

function nowMs(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : Date.now()
}

function normalizeUser(value) {
  const raw = value && typeof value === 'object' ? value : {}
  const id = Number(raw.id)
  return {
    id: Number.isSafeInteger(id) && id > 0 ? id : 0,
    nickname: typeof raw.nickname === 'string' ? raw.nickname.trim().slice(0, 32) : '',
    avatar_url: typeof raw.avatar_url === 'string' && raw.avatar_url.startsWith('https://') ? raw.avatar_url : '',
    has_web_password: raw.has_web_password === true,
    created_at: raw.created_at || null,
    last_login_at: raw.last_login_at || null
  }
}

function normalizeSession(value, currentTime = Date.now()) {
  const raw = value && typeof value === 'object' ? value : {}
  const token = typeof raw.token === 'string' ? raw.token : ''
  const expiresAt = Number(raw.expires_at)
  if (!TOKEN_PATTERN.test(token) || !Number.isSafeInteger(expiresAt) || expiresAt <= nowMs(currentTime)) return null
  return { token, expires_at: expiresAt, user: normalizeUser(raw.user) }
}

function readRawStorage() {
  if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') return null
  try { return wx.getStorageSync(STORAGE_KEY) || null } catch (_) { return null }
}

function removeRawStorage() {
  if (typeof wx === 'undefined' || typeof wx.removeStorageSync !== 'function') return
  try { wx.removeStorageSync(STORAGE_KEY) } catch (_) {}
}

function readSession(options = {}) {
  const raw = readRawStorage()
  const session = normalizeSession(raw, options.now)
  if (raw && !session) removeRawStorage()
  return session
}

function saveSession(payload, options = {}) {
  const raw = payload && typeof payload === 'object' ? payload : {}
  const token = typeof raw.token === 'string' ? raw.token : ''
  const expiresIn = Number(raw.expires_in)
  if (!TOKEN_PATTERN.test(token) || !Number.isSafeInteger(expiresIn) || expiresIn <= 0) {
    throw new Error('登录响应缺少有效会话信息。')
  }
  const session = {
    token,
    expires_at: nowMs(options.now) + expiresIn * 1000,
    user: normalizeUser(raw.user)
  }
  if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') throw new Error('当前环境无法保存登录状态。')
  wx.setStorageSync(STORAGE_KEY, session)
  return session
}

function updateUser(user) {
  const session = readSession()
  if (!session) return null
  const next = { ...session, user: normalizeUser(user) }
  try { wx.setStorageSync(STORAGE_KEY, next) } catch (_) { return session }
  return next
}

function clearSession() {
  removeRawStorage()
}

function getToken() {
  return readSession()?.token || ''
}

module.exports = {
  STORAGE_KEY,
  TOKEN_PATTERN,
  normalizeUser,
  normalizeSession,
  readSession,
  saveSession,
  updateUser,
  clearSession,
  getToken
}
