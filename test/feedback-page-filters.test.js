const test = require('node:test')
const assert = require('node:assert/strict')

global.wx = { showToast: () => {}, showModal: () => {} }
global.Page = (config) => { global.__feedbackPage = config }

const feedbackPath = require.resolve('../miniprogram/pages/feedback/index.js')
require(feedbackPath)
const page = global.__feedbackPage

function freshPage() {
  const instance = Object.create(page)
  instance.data = JSON.parse(JSON.stringify(page.data))
  instance.setData = function (patch) { Object.assign(this.data, patch) }
  return instance
}

test('native feedback submits the form through the feedback API without website navigation', async () => {
  const instance = freshPage()
  const feedbackApi = require('../miniprogram/utils/feedback-api')
  const originalSubmit = feedbackApi.submitFeedback
  const originalWx = global.wx
  let payload, refreshed = false
  feedbackApi.submitFeedback = async data => { payload = data; return { statusCode: 200, data: { ok: true } } }
  global.wx = { showToast() {}, navigateTo() { throw new Error('feedback must stay native') } }
  instance.loadFeedback = async () => { refreshed = true }
  instance.setData({ title: ' 界面建议 ', content: ' 希望优化提示 ', contact: '', type: 'feature' })
  try {
    await instance.submit()
    assert.deepEqual(payload, { title: '界面建议', content: '希望优化提示', contact: '', type: 'feature' })
    assert.equal(refreshed, true)
    assert.equal(instance.data.submitting, false)
    assert.equal(instance.data.content, '')
  } finally {
    feedbackApi.submitFeedback = originalSubmit
    global.wx = originalWx
  }
})

test('applyFilters searches title/content/reply and filters by status', () => {
  const instance = freshPage()
  instance.setData({
    feedbacks: [
      { id: '1', title: '评价界面UI更改', content: '建议调整界面', reply: '已调整', status: 'completed' },
      { id: '2', title: '课程缺失', content: '缺少高等数学', reply: '', status: 'open' },
      { id: '3', title: '其他建议', content: '希望增加暗色模式', reply: '排期中', status: 'open' }
    ]
  })
  instance.applyFilters()
  assert.equal(instance.data.visibleFeedbacks.length, 3)
  instance.setData({ searchKeyword: '高等数学' })
  instance.applyFilters()
  assert.deepEqual(instance.data.visibleFeedbacks.map(item => item.id), ['2'])
  instance.setData({ searchKeyword: '已调整' })
  instance.applyFilters()
  assert.deepEqual(instance.data.visibleFeedbacks.map(item => item.id), ['1'], '搜索应覆盖管理员回复')
  instance.setData({ searchKeyword: '', filterStatus: 'completed' })
  instance.applyFilters()
  assert.deepEqual(instance.data.visibleFeedbacks.map(item => item.id), ['1'])
  instance.setData({ filterStatus: 'open' })
  instance.applyFilters()
  assert.deepEqual(instance.data.visibleFeedbacks.map(item => item.id), ['2', '3'])
})

test('feedback rejects malformed and denied responses without clearing form or leaking errors', async () => {
  const feedbackApi = require('../miniprogram/utils/feedback-api')
  const originalSubmit = feedbackApi.submitFeedback
  const originalWx = global.wx
  let successes = 0
  global.wx = { showToast(value) { if (value.icon === 'success') successes++ } }
  try {
    for (const result of [null, {}, { statusCode: '200', data: { ok: true } },
      { statusCode: 200, data: { ok: false } }, { statusCode: 200, data: '<html>error</html>' },
      ...[302, 400, 401, 403, 429, 500].map(statusCode => ({ statusCode, data: { ok: true, error: 'internal-private-path' } }))]) {
      const instance = freshPage()
      const draft = { title: '标题', content: '反馈的内容', contact: '联系方式', reportUrl: 'https://example.com', reportTarget: '目标' }
      instance.setData(draft)
      instance.loadFeedback = async () => { throw new Error('must not refresh on failure') }
      feedbackApi.submitFeedback = async () => result
      await instance.submit()
      for (const [field, value] of Object.entries(draft)) assert.equal(instance.data[field], value)
      assert.equal(instance.data.submitting, false)
      assert.ok(instance.data.submitError)
      assert.doesNotMatch(instance.data.submitError, /internal-private-path/)
    }
    assert.equal(successes, 0)
  } finally { feedbackApi.submitFeedback = originalSubmit; global.wx = originalWx }
})

test('feedback locks all draft fields and blocks duplicate submissions while awaiting response', async () => {
  const feedbackApi = require('../miniprogram/utils/feedback-api')
  const originalSubmit = feedbackApi.submitFeedback
  const originalWx = global.wx
  let resolve, calls = 0
  feedbackApi.submitFeedback = () => { calls++; return new Promise(done => { resolve = done }) }
  global.wx = { showToast() {} }
  try {
    const instance = freshPage()
    const draft = { title: '投诉标题', content: '投诉内容', contact: '联系', type: 'report', reportUrl: 'https://example.com', reportTarget: '目标' }
    instance.setData(draft)
    instance.loadFeedback = async () => {}
    const pending = instance.submit()
    for (const method of ['inputTitle', 'inputContent', 'inputContact', 'inputReportUrl', 'inputReportTarget']) instance[method]({ detail: { value: '新编辑' } })
    instance.chooseType({ currentTarget: { dataset: { value: 'bug' } } })
    await instance.submit()
    assert.equal(calls, 1)
    for (const [field, value] of Object.entries(draft)) assert.equal(instance.data[field], value)
    resolve({ statusCode: 200, data: { ok: true } })
    await pending
    for (const field of ['title', 'content', 'contact', 'reportUrl', 'reportTarget']) assert.equal(instance.data[field], '')
    assert.equal(instance.data.submitting, false)
  } finally { feedbackApi.submitFeedback = originalSubmit; global.wx = originalWx }
})

test('feedback keeps content after network errors and allows deliberate retry', async () => {
  const feedbackApi = require('../miniprogram/utils/feedback-api')
  const originalSubmit = feedbackApi.submitFeedback
  const originalWx = global.wx
  global.wx = { showToast() {} }
  try {
    const instance = freshPage()
    instance.setData({ title: '建议', content: '建议的内容' })
    feedbackApi.submitFeedback = async () => { throw new Error('private diagnostic') }
    await instance.submit()
    assert.equal(instance.data.content, '建议的内容')
    assert.equal(instance.data.submitting, false)
    assert.match(instance.data.submitError, /网络异常/)
    assert.doesNotMatch(instance.data.submitError, /private diagnostic/)
    instance.inputContent({ detail: { value: '补充建议' } })
    assert.equal(instance.data.submitError, '')
    instance.loadFeedback = async () => {}
    feedbackApi.submitFeedback = async () => ({ statusCode: 200, data: { ok: true } })
    await instance.submit()
    assert.equal(instance.data.content, '')
  } finally { feedbackApi.submitFeedback = originalSubmit; global.wx = originalWx }
})

test('feedback prefill tolerates malformed encoding and bounds deep-link content', () => {
  const instance = freshPage()
  instance.loadFeedback = async () => {}
  instance.onLoad({ prefill_title: '%E0%A4%A', prefill_content: encodeURIComponent('字'.repeat(2100)) })
  assert.equal(instance.data.title, '%E0%A4%A')
  assert.equal(instance.data.content.length, 2000)
  assert.equal(instance.data.type, 'content')
})

test('loadFeedback merges own feedback (middle) with public feedback (bottom) when logged in', async () => {
  const instance = freshPage()
  const authPath = require.resolve('../miniprogram/utils/auth-session')
  const original = global.wx
  // feedback 页通过 auth-session.readSession() 判断登录态
  const authSession = require(authPath)
  const realRead = authSession.readSession
  authSession.readSession = () => ({ token: 't', user: { id: 1 } })
  const publicApiPath = require.resolve('../miniprogram/services/public-api')
  const publicApi = require(publicApiPath)
  const realGetMy = publicApi.publicApi.getMyFeedback
  publicApi.publicApi.getMyFeedback = async () => ({ items: [{ id: 'mine-1', title: '我的反馈', content: 'x', status: 'open', type: 'bug', createdAt: '2026-09-19T02:00:00.000Z' }] })
  const feedbackApi = require(require.resolve('../miniprogram/utils/feedback-api'))
  const realList = feedbackApi.listFeedback
  feedbackApi.listFeedback = async () => ({ items: [{ id: 'pub-1', title: '公开反馈', content: 'y', status: 'completed', type: 'feature', createdAt: '2026-09-18T02:00:00.000Z' }] })
  try {
    await instance.loadFeedback()
    assert.equal(instance.data.loggedIn, true)
    assert.equal(instance.data.myFeedbacks.length, 1)
    assert.equal(instance.data.myFeedbacks[0].title, '我的反馈')
    assert.equal(instance.data.myFeedbacks[0].createdAtLabel, '2026-09-19')
    assert.ok(Array.isArray(instance.data.feedbacks), '公开反馈列表仍加载')
  } finally {
    authSession.readSession = realRead
    publicApi.publicApi.getMyFeedback = realGetMy
    feedbackApi.listFeedback = realList
    global.wx = original
  }
})

test('loadFeedback skips own feedback section when logged out', async () => {
  const instance = freshPage()
  const authSession = require(require.resolve('../miniprogram/utils/auth-session'))
  const realRead = authSession.readSession
  authSession.readSession = () => null
  const feedbackApi = require(require.resolve('../miniprogram/utils/feedback-api'))
  const realList = feedbackApi.listFeedback
  feedbackApi.listFeedback = async () => ({ items: [] })
  try {
    await instance.loadFeedback()
    assert.equal(instance.data.loggedIn, false)
    assert.deepEqual(instance.data.myFeedbacks, [])
    assert.ok(Array.isArray(instance.data.feedbacks))
  } finally {
    authSession.readSession = realRead
    feedbackApi.listFeedback = realList
  }
})
