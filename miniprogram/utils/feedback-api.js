const BASE = 'https://nkustudy.top/feedback-api'
const authSession = require('./auth-session')

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/json', ...(options.header || {}) }
    const token = authSession.getToken()
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

async function listFeedback() {
  const response = await request('/feedback')
  if (response.statusCode >= 400) throw new Error((response.data && response.data.error) || '加载失败')
  return response.data || {}
}

function submitFeedback({ title, content, type = 'bug', contact = '', resourceRef = '' }) {
  return request('/submit', { method: 'POST', data: { title, content, type, contact, resourceRef } })
}

module.exports = { listFeedback, submitFeedback, BASE }
