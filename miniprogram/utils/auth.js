function unavailableError() {
  const error = new Error('功能建设中，暂未连接线上登录服务。')
  error.code = 'FEATURE_UNAVAILABLE'
  return error
}

function getStoredUser() {
  return null
}

async function ensureLogin() {
  throw unavailableError()
}

function logout() {
  wx.removeStorageSync('auth_token')
  wx.removeStorageSync('auth_user')
}

module.exports = { ensureLogin, getStoredUser, logout, unavailableError }
