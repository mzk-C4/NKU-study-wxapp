const test = require('node:test')
const assert = require('node:assert/strict')

// 模拟 wx.request 收集上报请求
const requests = []
global.wx = {
  request(options) { requests.push(options) }
}

const { reportVisit } = require('../miniprogram/utils/visit-report')

test('visit reporting posts only the page path and nothing else', () => {
  requests.length = 0
  reportVisit('/mp/home')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].method, 'POST')
  assert.equal(requests[0].url, 'https://nkustudy.top/visit-api/hit')
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