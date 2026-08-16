const config = require('../config')

const STATUS_MESSAGES = Object.freeze({
  400: '请求参数无效，请调整后重试。',
  404: '内容不存在或功能暂未开放。',
  409: '当前操作暂不可用，请刷新后重试。',
  429: '请求过于频繁，请稍后再试。',
  500: '服务暂时不可用，请稍后再试。',
  503: '服务正在恢复，请稍后再试。'
})

function classifyStatus(statusCode) {
  if (statusCode === 400) return 'invalid_request'
  if (statusCode === 404) return 'not_found'
  if (statusCode === 409) return 'conflict'
  if (statusCode === 429) return 'rate_limited'
  if (statusCode === 503) return 'unavailable'
  if (statusCode >= 500) return 'server_error'
  return 'http_error'
}

function safeServerMessage(value) {
  if (typeof value !== 'string') return ''
  const message = value.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
  if (!message) return ''
  if (/(?:https?:\/\/|[A-Za-z]:\\|\/var\/|\/home\/|stack|token|secret|password)/i.test(message)) return ''
  return message
}

function createHttpError(statusCode, payload) {
  const safePayload = payload && typeof payload === 'object' ? payload : {}
  const message = safeServerMessage(safePayload.message) || STATUS_MESSAGES[statusCode] || `请求失败（${statusCode || '未知状态'}）`
  const error = new Error(message)
  error.name = 'PublicRequestError'
  error.statusCode = Number(statusCode) || 0
  error.code = typeof safePayload.code === 'string' ? safePayload.code : 'HTTP_ERROR'
  error.kind = classifyStatus(error.statusCode)
  error.payload = safePayload
  return error
}

function createNetworkError() {
  const error = new Error('网络连接失败，请检查网络后重试。')
  error.name = 'PublicRequestError'
  error.statusCode = 0
  error.code = 'NETWORK_ERROR'
  error.kind = 'network_error'
  error.payload = null
  return error
}

function requestWith(wxApi, path, options = {}) {
  return new Promise((resolve, reject) => {
    wxApi.request({
      url: `${config.apiBaseUrl}${path}`,
      method: options.method || 'GET',
      data: options.data,
      timeout: config.requestTimeout,
      header: {
        'content-type': 'application/json',
        ...(options.header || {})
      },
      success(response) {
        const payload = response.data && typeof response.data === 'object' ? response.data : {}
        if (response.statusCode >= 200 && response.statusCode < 300 && payload.code === 0) {
          resolve(payload.data)
          return
        }
        reject(createHttpError(response.statusCode, payload))
      },
      fail() {
        reject(createNetworkError())
      }
    })
  })
}

function createRequestTransport(wxApi) {
  return {
    request(path, options) { return requestWith(wxApi, path, options) },
    get(path, data) { return requestWith(wxApi, path, { data }) },
    post(path, data) { return requestWith(wxApi, path, { method: 'POST', data }) },
    patch(path, data) { return requestWith(wxApi, path, { method: 'PATCH', data }) },
    delete(path, data) { return requestWith(wxApi, path, { method: 'DELETE', data }) }
  }
}

function currentWx() {
  if (typeof wx === 'undefined') throw new Error('微信运行环境不可用')
  return wx
}

module.exports = {
  request(path, options) { return requestWith(currentWx(), path, options) },
  get(path, data) { return requestWith(currentWx(), path, { data }) },
  post(path, data) { return requestWith(currentWx(), path, { method: 'POST', data }) },
  patch(path, data) { return requestWith(currentWx(), path, { method: 'PATCH', data }) },
  delete(path, data) { return requestWith(currentWx(), path, { method: 'DELETE', data }) },
  classifyStatus,
  safeServerMessage,
  createHttpError,
  createNetworkError,
  createRequestTransport
}
