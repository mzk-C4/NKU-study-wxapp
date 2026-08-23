const BASE = 'https://nkustudy.top/feedback-api'
const auth = require('../services/auth')

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/json', ...(options.header || {}) }
    const token = auth.getToken()
    if (token) headers.authorization = `Bearer ${token}`
    wx.request({
      url: `${BASE}${path}`,
      method: options.method || 'GET',
      header: headers,
      data: options.data,
      success: resolve,
      fail: reject
    })
  })
}

function listFeedback() { return request('/feedback') }

function submitFeedback({ title, content, type = 'bug', contact = '', resourceRef = '' }) {
  return request('/submit', { method: 'POST', data: { title, content, type, contact, resourceRef } })
}

module.exports = { listFeedback, submitFeedback, BASE }
