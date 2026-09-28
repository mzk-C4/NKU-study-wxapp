const test = require('node:test')
const assert = require('node:assert/strict')
const { createRequestGeneration } = require('../miniprogram/utils/request-generation')

test('website entry only copies the fixed homepage URL and handles copy failures', t => {
  const previousPage = global.Page
  const previousWx = global.wx
  t.after(() => { global.Page = previousPage; global.wx = previousWx })
  let page
  let clipboard
  let copies = 0
  global.Page = definition => { page = definition }
  global.wx = {
    setClipboardData(options) { copies++; clipboard = options },
    request() { assert.fail('website entry must not request donation data') },
    requestPayment() { assert.fail('website entry must never launch payment') }
  }
  const modulePath = require.resolve('../miniprogram/pages/donate/index')
  delete require.cache[modulePath]
  require(modulePath)
  page.setData = patch => Object.assign(page.data, patch)
  page.onShow()
  assert.equal(page.onLoad, undefined)
  assert.equal(page.pay, undefined)
  assert.equal(page.confirmDonate, undefined)
  page.copyWebsite()
  page.copyWebsite()
  assert.equal(copies, 1)
  assert.equal(clipboard.data, 'https://nkustudy.top/')
  clipboard.success()
  clipboard.complete()
  assert.equal(page.data.copied, true)
  assert.equal(page.data.copying, false)
  page.copyWebsite()
  clipboard.fail()
  clipboard.complete()
  assert.equal(page.data.copied, false)
  assert.match(page.data.copyError, /复制失败/)
})

test('profile retains a neutral website entry with no in-app donation UI or payment calls', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const read = file => fs.readFileSync(path.join(__dirname, '../miniprogram', file), 'utf8')
  const profile = read('pages/profile/index.wxml')
  assert.match(profile, /bindtap="openWebsite"/)
  assert.match(profile, /访问 NKUStudy 网站/)
  assert.doesNotMatch(profile, /捐助|赞助|打赏|openDonate/)
  const page = read('pages/donate/index.wxml')
  assert.match(page, /复制网站链接/)
  assert.doesNotMatch(page, /捐助|捐赠|赞助|打赏|金额|<web-view|bindtap="pay"/)
  assert.doesNotMatch(read('pages/donate/index.js'), /requestPayment|getDonate|createDonateOrder/)
  assert.doesNotMatch(read('services/public-api.js'), /createDonateOrder|getDonate|\/donate\/pay/)
  assert.equal(JSON.parse(read('pages/donate/index.json')).navigationBarTitleText, 'NKUStudy 网站')
  const config = JSON.parse(read('app.json'))
  assert.ok(config.pages.includes('pages/donate/index'))
})

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
  const previousWx = global.wx
  global.wx = {
    showModal: () => {}, switchTab: () => {},
    getStorageSync: () => ({ token: 'testtokenabcdef123456', expires_at: Date.now() + 86400000, user: { id: 1 } })
  }
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
  delete global.wx
  if (previousWx !== undefined) global.wx = previousWx
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
    async getMe() { return { id: 7, nickname: '小紫', has_web_password: true } },
    async getFavorites() { return { items: [{ course_id: 'course-1', name: '概率论' }], total: 1 } },
    async getMyReviews() { return { items: [{ id: 'review-1', course_title: '概率论', teacher_name: '张老师', rating: 5, body: '讲解清晰', status: 'pending' }], total: 1 } }
  }
  const page = createProfilePage(api, sessionStore)
  page.data = { ...page.data }
  page.setData = patch => Object.assign(page.data, patch)

  await page.refresh()
  assert.deepEqual(updatedUser, { id: 7, nickname: '小紫', has_web_password: true })
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

test('resource submission uses the website while feedback stays native', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const root = path.join(__dirname, '..')
  const app = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'))
  const profile = fs.readFileSync(path.join(root, 'miniprogram/pages/profile/index.js'), 'utf8')
  const participate = fs.readFileSync(path.join(root, 'miniprogram/pages/participate-web/index.js'), 'utf8')
  const feedback = fs.readFileSync(path.join(root, 'miniprogram/pages/feedback/index.wxml'), 'utf8')
  const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))

  assert.equal(app.pages.includes('pages/submit-resource/index'), false)
  assert.equal(app.pages.includes('pages/participate-web/index'), true)
  assert.equal(app.pages.includes('pages/feedback/index'), true)
  assert.ok(project.packOptions.ignore.some(item => item.value === 'pages/submit-resource'))
  assert.match(profile, /wx\.navigateTo\(\{ url: '\/pages\/participate-web\/index' \}\)/)
  assert.match(profile, /openFeedback\(\) \{ wx\.navigateTo\(\{ url: '\/pages\/feedback\/index' \}\)/)
  assert.match(participate, /https:\/\/nkustudy\.top\/participate\//)
  assert.match(feedback, /bindtap="submit">提交反馈/)
  assert.doesNotMatch(feedback, /web-view/)
})

test('profile login action owns a full-width native button layout', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const root = path.join(__dirname, '..')
  const markup = fs.readFileSync(path.join(root, 'miniprogram/pages/profile/index.wxml'), 'utf8')
  const styles = fs.readFileSync(path.join(root, 'miniprogram/pages/profile/index.wxss'), 'utf8')

  assert.match(markup, /class="login-button"[^>]*>微信登录<\/button>/)
  assert.match(styles, /\.login-button\s*\{[^}]*width:\s*100%\s*!important[^}]*min-width:\s*100%[^}]*max-width:\s*100%[^}]*margin:\s*24rpx\s+0\s+0\s*!important/s)
})

test('website submission load failure keeps a fixed URL copy and retry exit', () => {
  const originalPage = global.Page
  const originalWx = global.wx
  let page, clipboard
  global.Page = config => { page = config }
  const route = require.resolve('../miniprogram/pages/participate-web/index.js')
  delete require.cache[route]
  try {
    require(route)
    page.data = { ...page.data }
    page.setData = patch => Object.assign(page.data, patch)
    global.wx = { setClipboardData(options) { clipboard = options; options.fail() } }
    page.onLoad({ url: 'https://untrusted.example/' })
    assert.equal(page.data.url, 'https://nkustudy.top/participate/')
    page.failed()
    assert.equal(page.data.failed, true)
    page.copyLink()
    assert.equal(clipboard.data, 'https://nkustudy.top/participate/')
    assert.match(page.data.copyError, /复制失败/)
    page.retry()
    assert.equal(page.data.failed, false)
    assert.equal(page.data.copyError, '')
  } finally { global.Page = originalPage; global.wx = originalWx; delete require.cache[route] }
})
