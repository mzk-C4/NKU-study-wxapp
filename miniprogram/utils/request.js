const config = require('../config')

function request(path, options = {}) {
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
        reject(error)
      },
      fail(error) {
        reject(new Error(error.errMsg || '网络开小差了'))
      }
    })
  })
}

module.exports = {
  get(path, data) { return request(path, { data }) },
  post(path, data) { return request(path, { method: 'POST', data }) },
  patch(path, data) { return request(path, { method: 'PATCH', data }) },
  delete(path, data) { return request(path, { method: 'DELETE', data }) }
}
