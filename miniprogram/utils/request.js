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
      timeout: Number.isFinite(Number(options.timeout)) && Number(options.timeout) > 0
        ? Number(options.timeout)
        : config.requestTimeout,
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
        if (response.statusCode === 401 && token && authSession.getToken() === token) authSession.clearSession()
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

function upload(path, filePath, options = {}) {
  const token = authSession.getToken()
  if (!token) return Promise.reject(authRequiredError())
  return new Promise((resolve, reject) => {
    const fail = failure => {
      const detail = typeof failure?.errMsg === 'string' ? failure.errMsg : ''
      const code = /url not in domain list/i.test(detail) ? 'UPLOAD_DOMAIN_NOT_ALLOWED' : 'NETWORK_ERROR'
      reject(Object.assign(new Error(/timeout/i.test(detail)
        ? '头像上传超时，请稍后重试。' : '头像上传失败，请稍后重试。'), { code }))
    }
    try {
      wx.uploadFile({
        url: `${config.apiBaseUrl}${path}`,
        filePath,
        name: options.name || 'file',
        timeout: options.timeout || 60000,
        // wx.uploadFile sets the multipart boundary; do not use the JSON request header.
        header: { authorization: `Bearer ${token}` },
        success(response) {
          const statusCode = response?.statusCode
          if (statusCode === 401) {
            if (authSession.getToken() === token) authSession.clearSession()
            reject(authRequiredError())
            return
          }
          let payload
          try { payload = JSON.parse(response?.data) } catch (_) {}
          const validStatus = Number.isInteger(statusCode) && statusCode >= 200 && statusCode < 300
          if (validStatus && payload?.code === 0 && payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
            resolve(payload.data)
            return
          }
          const error = new Error('头像上传失败，请稍后重试。')
          error.statusCode = statusCode
          error.code = typeof payload?.code === 'string' && payload.code !== 'AUTH_REQUIRED' && /^[A-Z][A-Z0-9_]{0,63}$/.test(payload.code)
            ? payload.code : 'UPLOAD_FAILED'
          // Raw upload responses can contain proxy/storage details. Do not retain or display them.
          reject(error)
        },
        fail
      })
    } catch (_) { fail() }
  })
}

module.exports = {
  request,
  upload,
  get(path, data, options = {}) { return request(path, { ...options, data }) },
  post(path, data, options = {}) { return request(path, { ...options, method: 'POST', data }) },
  put(path, data, options = {}) { return request(path, { ...options, method: 'PUT', data }) },
  delete(path, data, options = {}) { return request(path, { ...options, method: 'DELETE', data }) }
}
