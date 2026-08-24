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

test('profile restores a valid session and renders server favorites and review states', async () => {
  const originalPage = global.Page
  global.Page = () => {}
  const modulePath = require.resolve('../miniprogram/pages/profile/index.js')
  delete require.cache[modulePath]
  const { createProfilePage } = require(modulePath)
  global.Page = originalPage

  const originalWx = global.wx
  global.wx = { getStorageSync(key) { return key === 'browse_history' ? [{ id: 'history-1' }] : null } }
  let updatedUser = null
  const sessionStore = {
    readSession() { return { token: 'token', user: { id: 7, nickname: '' } } },
    updateUser(user) { updatedUser = user },
    clearSession() {}
  }
  const api = {
    async getMe() { return { id: 7, nickname: '小紫' } },
    async getFavorites() { return { items: [{ course_id: 'course-1', name: '概率论' }], total: 1 } },
    async getMyReviews() { return { items: [{ id: 'review-1', course_title: '概率论', teacher_name: '张老师', rating: 5, body: '讲解清晰', status: 'pending' }], total: 1 } }
  }
  const page = createProfilePage(api, sessionStore)
  page.data = { ...page.data }
  page.setData = patch => Object.assign(page.data, patch)

  await page.refresh()
  assert.deepEqual(updatedUser, { id: 7, nickname: '小紫' })
  assert.equal(page.data.isLoggedIn, true)
  assert.equal(page.data.userInitial, '小')
  assert.equal(page.data.favoriteTotal, 1)
  assert.equal(page.data.reviews[0].status_label, '审核中')
  assert.deepEqual(page.data.history, [{ id: 'history-1' }])
  global.wx = originalWx
})

test('profile clears a rejected session without leaving stale personal data', async () => {
  const originalPage = global.Page
  global.Page = () => {}
  const modulePath = require.resolve('../miniprogram/pages/profile/index.js')
  delete require.cache[modulePath]
  const { createProfilePage } = require(modulePath)
  global.Page = originalPage

  const originalWx = global.wx
  global.wx = { getStorageSync() { return [] } }
  let cleared = false
  const sessionStore = {
    readSession() { return { token: 'token', user: { id: 7, nickname: '旧昵称' } } },
    updateUser() {},
    clearSession() { cleared = true }
  }
  const authError = Object.assign(new Error('请先登录'), { statusCode: 401, code: 'AUTH_REQUIRED' })
  const api = {
    async getMe() { throw authError },
    async getFavorites() { throw authError },
    async getMyReviews() { throw authError }
  }
  const page = createProfilePage(api, sessionStore)
  page.data = { ...page.data, favorites: [{ course_id: 'stale' }], reviews: [{ id: 'stale' }] }
  page.setData = patch => Object.assign(page.data, patch)

  await page.refresh()
  assert.equal(cleared, true)
  assert.equal(page.data.isLoggedIn, false)
  assert.deepEqual(page.data.favorites, [])
  assert.deepEqual(page.data.reviews, [])
  global.wx = originalWx
})

test('profile resource submission opens the registered NKUStudy participate web-view', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const root = path.join(__dirname, '..')
  const app = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'))
  const profile = fs.readFileSync(path.join(root, 'miniprogram/pages/profile/index.js'), 'utf8')
  const participate = fs.readFileSync(path.join(root, 'miniprogram/pages/participate-web/index.js'), 'utf8')

  assert.equal(app.pages.includes('pages/participate-web/index'), true)
  assert.match(profile, /wx\.navigateTo\(\{ url: '\/pages\/participate-web\/index' \}\)/)
  assert.match(participate, /https:\/\/nkustudy\.top\/participate\//)
})
