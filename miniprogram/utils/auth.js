const api = require('./request')

function getStoredUser() {
  return wx.getStorageSync('auth_user') || null
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
  wx.setStorageSync('auth_token', session.token)
  wx.setStorageSync('auth_user', session.user)
  return session
}

function logout() {
  wx.removeStorageSync('auth_token')
  wx.removeStorageSync('auth_user')
}

module.exports = { ensureLogin, getStoredUser, logout }
