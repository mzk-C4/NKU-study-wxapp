const config = require('../config')
const authSession = require('./auth-session')

function authRequiredError() {
  const error = new Error('请先登录后再操作。')
  error.statusCode = 401
  error.code = 'AUTH_REQUIRED'
  return error
}

function request(path, options = {}) {
  const authMode = options.auth || 'none'
  const token = authMode === 'none' ? '' : authSession.getToken()
  if (authMode === 'required' && !token) return Promise.reject(authRequiredError())
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.apiBaseUrl}${path}`,
      method: options.method || 'GET',
      data: options.data,
      timeout: config.requestTimeout,
      header: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(options.header || {})
      },
      success(response) {
        const payload = response.data || {}
        if (response.statusCode >= 200 && response.statusCode < 300 && payload.code === 0) {
          resolve(payload.data)
          return
        }
        let message = payload.message || `请求失败（${response.statusCode}）`
        if (response.statusCode === 429) message = payload.message || '请求过于频繁，请稍后再试。'
        if (response.statusCode === 404) message = payload.message || '请求的内容不存在或已调整。'
        const error = new Error(message)
        error.statusCode = response.statusCode
        error.code = payload.code || 'REQUEST_FAILED'
        error.payload = payload
        if (response.statusCode === 401 && token) authSession.clearSession()
        reject(error)
      },
      fail(error) {
        const message = error.errMsg?.includes('timeout') ? '请求超时，请稍后重试。' : '网络连接失败，请检查网络后重试。'
        const requestError = new Error(message)
        requestError.code = 'NETWORK_ERROR'
        requestError.cause = error
        reject(requestError)
      }
    })
  })
}

module.exports = {
  request,
  get(path, data, options = {}) { return request(path, { ...options, data }) },
  post(path, data, options = {}) { return request(path, { ...options, method: 'POST', data }) },
  put(path, data, options = {}) { return request(path, { ...options, method: 'PUT', data }) },
  delete(path, data, options = {}) { return request(path, { ...options, method: 'DELETE', data }) }
}
