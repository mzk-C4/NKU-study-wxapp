const test = require('node:test')
const assert = require('node:assert/strict')

// 模拟 wx.request 收集上报请求
const requests = []
function captureRequest(options) { requests.push(options) }
global.wx = {
  request: captureRequest
}

const { reportVisit, getVisitStats } = require('../miniprogram/utils/visit-report')

test('visit reporting posts only the page path and nothing else', () => {
  requests.length = 0
  reportVisit('/mp/home')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].method, 'POST')
  assert.equal(requests[0].url, 'https://nkustudy.top/visit-api/hit')
  assert.equal(requests[0].timeout, 8000)
  assert.deepEqual(requests[0].data, { path: '/mp/home' })
  assert.equal(JSON.stringify(requests[0].data).includes('openid'), false)
  assert.equal(Object.keys(requests[0].header).includes('Authorization'), false)
})

test('visit reporting rejects malformed page names silently', () => {
  requests.length = 0
  reportVisit('/mp/Home')
  reportVisit('/mp/course overview')
  reportVisit('/mp/课程')
  reportVisit('home')
  reportVisit(undefined)
  assert.equal(requests.length, 0)
})

test('visit reporting returns the shared public stats without adding identity data', async () => {
  requests.length = 0
  global.wx.request = options => {
    requests.push(options)
    options.success({
      statusCode: 200,
      data: { ok: true, stats: { counted: true, total: 618, today: 12, startedAt: '2026-07-14T16:00:00+08:00', visitors: { secret: true } } }
    })
  }
  try {
    const stats = await reportVisit('/mp/home')
    assert.equal(stats.total, 618)
    assert.equal(stats.startedAt, '2026-07-14T16:00:00+08:00')
    assert.equal(Object.prototype.hasOwnProperty.call(stats, 'visitors'), false)
    assert.deepEqual(requests[0].data, { path: '/mp/home' })
  } finally {
    global.wx.request = captureRequest
  }
})

test('public visit stats use the same website endpoint and fail closed', async () => {
  requests.length = 0
  global.wx.request = options => {
    requests.push(options)
    options.success({ statusCode: 200, data: null })
  }
  try {
    assert.equal(await getVisitStats(), null)
    assert.equal(requests[0].url, 'https://nkustudy.top/visit-api/stats')
    assert.equal(requests[0].method, 'GET')
  } finally {
    global.wx.request = captureRequest
  }
})
