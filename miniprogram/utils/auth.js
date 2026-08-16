const api = require('./request')

function getStoredUser() {
  const token = wx.getStorageSync('auth_token')
  const user = wx.getStorageSync('auth_user')
  const expiresAt = wx.getStorageSync('auth_expires_at')
  if (!token || !user || (expiresAt && Date.parse(expiresAt) <= Date.now())) {
    api.clearStoredSession()
    return null
  }
  return user
}

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({ success: resolve, fail: reject })
  })
}

async function ensureLogin() {
  const token = wx.getStorageSync('auth_token')
  const user = getStoredUser()
  if (token && user) return { token, user }

  const result = await wxLogin()
  if (!result.code) throw new Error('未获得微信登录凭证')
  const session = await api.post('/auth/wechat', { code: result.code })
  api.saveSession(session)
  return session
}

function logout() {
  api.clearStoredSession()
}

module.exports = { ensureLogin, getStoredUser, logout }
