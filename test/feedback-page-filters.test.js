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
