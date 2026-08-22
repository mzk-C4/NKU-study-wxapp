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
      return { id: 'course-1' }
    },
    async getCourseReviewGroups() { return [] },
    async getHome() { return { review_submission: { allow_custom_course: false, allow_custom_teacher: true } } },
    async searchCatalog() { return { items: [] } },
    async submitReview() {}
  }
  const page = createWriteReviewPage(api)
  page.data = { ...page.data, courseId: 'course-1' }
  page.setData = patch => Object.assign(page.data, patch)

  await page.prepare()
  assert.equal(page.data.loading, false)
  assert.equal(page.data.error, '服务暂时不可用')

  await page.prepare()
  assert.equal(page.data.loading, false)
  assert.equal(page.data.error, '')
  assert.deepEqual(page.data.course, { id: 'course-1' })
})
