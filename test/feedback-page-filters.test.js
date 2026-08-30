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
