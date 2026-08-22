const test = require('node:test')
const assert = require('node:assert/strict')
const { createRequestGeneration } = require('../miniprogram/utils/request-generation')

test('only the latest request token may update a page', () => {
  const requests = createRequestGeneration()
  const firstQuery = requests.begin({ newQuery: true })
  const firstPage = requests.begin()
  assert.equal(requests.isLatest(firstQuery), false)
  assert.equal(requests.isLatest(firstPage), true)

  const nextQuery = requests.begin({ newQuery: true })
  assert.equal(requests.isLatest(firstPage), false)
  assert.equal(requests.isLatest(nextQuery), true)
})

test('write-review load failure has an in-page retry that can recover', async () => {
  const originalPage = global.Page
  global.Page = () => {}
  const modulePath = require.resolve('../miniprogram/pages/write-review/index.js')
  delete require.cache[modulePath]
  const { createWriteReviewPage } = require(modulePath)
  global.Page = originalPage

  let attempts = 0
  const api = {
    async getCourse() {
      attempts += 1
      if (attempts === 1) throw new Error('服务暂时不可用')
      return { id: 'course-1', name: '示例课程' }
    },
    async getHome() { return { review_submission: { allow_custom_course: false, allow_custom_teacher: true } } },
    async searchCatalog() { return { items: [] } },
    async submitReview() {}
  }
  const page = createWriteReviewPage(api)
  page.data = { ...page.data }
  page.setData = patch => Object.assign(page.data, patch)

  await page.prepare('course-1')
  assert.equal(page.data.loading, false)
  assert.equal(page.data.error, '')

  // 第 1 次 getCourse 抛错（preset 选课失败静默跳过），第 2 次成功
  page.setData({ loading: true })
  await page.prepare('course-1')
  assert.equal(page.data.selectedCourse?.id, 'course-1')
  assert.equal(page.data.selectedCourse?.name, '示例课程')

  // 搜索选课
  const results = await page.searchCourses('示例')
  assert.ok(Array.isArray(results))
})
