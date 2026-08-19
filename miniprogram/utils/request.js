const config = require('../config')

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.apiBaseUrl}${path}`,
      method: options.method || 'GET',
      data: options.data,
      timeout: config.requestTimeout,
      header: {
        'content-type': 'application/json',
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
  get(path, data, header) { return request(path, { data, header }) },
  post(path, data, header) { return request(path, { method: 'POST', data, header }) }
}
