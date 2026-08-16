const config = require('../config')
let refreshSessionPromise = null

function clearStoredSession() {
  wx.removeStorageSync('auth_token')
  wx.removeStorageSync('auth_user')
  wx.removeStorageSync('auth_expires_at')
  try {
    const app = getApp()
    if (app && app.globalData) app.globalData.user = null
  } catch (_) {}
}

function saveSession(session) {
  wx.setStorageSync('auth_token', session.token)
  wx.setStorageSync('auth_user', session.user)
  if (session.expires_at) wx.setStorageSync('auth_expires_at', session.expires_at)
  try {
    const app = getApp()
    if (app && app.globalData) app.globalData.user = session.user
  } catch (_) {}
}

function wxLogin() {
  return new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }))
}

function rawRequest(path, options = {}) {
  const token = wx.getStorageSync('auth_token')
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.apiBaseUrl}${path}`,
      method: options.method || 'GET',
      data: options.data,
      timeout: config.requestTimeout,
      header: {
        'content-type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.header || {})
      },
      success(response) {
        const payload = response.data || {}
        if (response.statusCode >= 200 && response.statusCode < 300 && payload.code === 0) {
          resolve(payload.data)
          return
        }
        const error = new Error(payload.message || `请求失败（${response.statusCode}）`)
        error.statusCode = response.statusCode
        error.payload = payload
        error.hadAuthToken = Boolean(token)
        reject(error)
      },
      fail(error) {
        reject(new Error(error.errMsg || '网络开小差了'))
      }
    })
  })
}

async function request(path, options = {}) {
  try {
    return await rawRequest(path, options)
  } catch (error) {
    const expiredToken = error.statusCode === 401 && error.hadAuthToken
    if (!expiredToken || options.skipAuthRetry) throw error

    if (!refreshSessionPromise) {
      clearStoredSession()
      refreshSessionPromise = (async () => {
        let loginResult
        try {
          loginResult = await wxLogin()
        } catch (_) {
          throw new Error('登录已过期，请重新登录')
        }
        if (!loginResult.code) throw new Error('登录已过期，请重新登录')
        const session = await rawRequest('/auth/wechat', { method: 'POST', data: { code: loginResult.code }, skipAuthRetry: true })
        saveSession(session)
        return session
      })().finally(() => { refreshSessionPromise = null })
    }
    await refreshSessionPromise
    return rawRequest(path, { ...options, skipAuthRetry: true })
  }
}

module.exports = {
  get(path, data) { return request(path, { data }) },
  post(path, data) { return request(path, { method: 'POST', data }) },
  patch(path, data) { return request(path, { method: 'PATCH', data }) },
  delete(path, data) { return request(path, { method: 'DELETE', data }) },
  clearStoredSession,
  saveSession
}
