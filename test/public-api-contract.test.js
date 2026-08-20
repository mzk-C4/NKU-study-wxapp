const test = require('node:test')
const assert = require('node:assert/strict')
const fixtures = require('./fixtures/public-api')
const { adaptCourse, adaptResourceList, createPublicApi } = require('../miniprogram/services/public-api')
const { validDownloadUrl } = require('../miniprogram/utils/resource-download')

function transportFixture() {
  const calls = []
  return {
    calls,
    async get(path, data, options) {
      calls.push({ method: 'GET', path, data, ...(options ? { options } : {}) })
      if (path === '/home') return fixtures.home
      if (path === '/courses') return fixtures.courses
      if (path.endsWith('/resources')) return fixtures.resources
      if (path === `/courses/${fixtures.course.id}`) return fixtures.course
      if (path === '/review-groups') return { items: [fixtures.reviewGroup], total: 1 }
      if (path === '/review-groups/group-key') return fixtures.reviewGroup
      if (path === '/me') return { user: { id: 7, nickname: '小紫', avatar_url: '' } }
      if (path === '/me/favorites') return { items: [{ course_id: fixtures.course.id, name: fixtures.course.name, term: '大一上', group: '通识选修课' }], total: 1, page: 1, page_size: 100 }
      if (path === '/me/reviews') return { items: [{ id: 'review-me', course_title: fixtures.course.name, teacher_name: '张老师', rating: 5, body: '正文', status: 'pending' }], total: 1, page: 1, page_size: 100 }
      throw new Error(`unexpected GET ${path}`)
    },
    async post(path, data, options) {
      calls.push({ method: 'POST', path, data, ...(options ? { options } : {}) })
      if (path === '/auth/wechat') return { token: 'abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890', expires_in: 2592000, user: { id: 7, nickname: '' } }
      if (path === '/me/profile') return { user: { id: 7, nickname: data.nickname, avatar_url: '' } }
      if (path === '/auth/logout') return { revoked: true }
      if (path === '/favorites') return { favorited: true, created: true, total: 1 }
      return { submitted: true, pending: true }
    },
    async delete(path, data, options) {
      calls.push({ method: 'DELETE', path, data, ...(options ? { options } : {}) })
      return { favorited: false, removed: true, total: 0 }
    }
  }
}

test('course and resource adapters keep only the documented public DTO', () => {
  const course = adaptCourse(fixtures.course)
  const resource = adaptResourceList(fixtures.resources).items[0]
  assert.equal(course.id, fixtures.course.id)
  assert.equal(course.group, '通识选修课')
  assert.equal('basePath' in course, false)
  assert.equal('source' in course, false)
  assert.equal(resource.download_url, 'https://resources.nkustudy.top/resources/test.pdf')
  assert.equal('path' in resource, false)
})

test('course requests use only the server filter contract and enforce page_size <= 100', async () => {
  const transport = transportFixture()
  const api = createPublicApi(transport)
  await api.getCourses({ q: '概率论', group: '通识选修课', term: '大一上', tag: '数学', assessment: '绩点制', category: '旧分类', sort: '旧排序', page_size: 200 })
  assert.deepEqual(transport.calls[0], { method: 'GET', path: '/courses', data: { page: 1, page_size: 100, q: '概率论', term: '大一上', group: '通识选修课', tag: '数学', assessment: '绩点制' } })
})

test('reviews use group endpoints and the one-rating submission body', async () => {
  const transport = transportFixture()
  const api = createPublicApi(transport)
  const course = await api.getCourse(fixtures.course.id)
  const groups = await api.getCourseReviewGroups(course)
  assert.equal(groups[0].items[0].rating, 5)
  await api.submitReview({ course_id: course.id, teacher: '张老师', rating: 5, tags: ['讲解清晰'], body: '正文', anonymous: true, difficulty: 1 })
  assert.deepEqual(transport.calls.at(-1), { method: 'POST', path: '/reviews', data: { course_id: course.id, teacher: '张老师', rating: 5, tags: ['讲解清晰'], body: '正文', anonymous: true }, options: { auth: 'optional' } })
})

test('authentication, favorites and personal reviews follow the protected server contract', async () => {
  const transport = transportFixture()
  const api = createPublicApi(transport)
  const login = await api.loginWechat('wechat-code')
  const user = await api.getMe()
  const favorites = await api.getFavorites({ page_size: 500 })
  const reviews = await api.getMyReviews({ page_size: 500 })
  await api.updateProfile({ nickname: '新昵称' })
  await api.addFavorite(fixtures.course.id)
  await api.removeFavorite('course/with space')
  await api.logout()

  assert.equal(login.expires_in, 2592000)
  assert.equal(user.nickname, '小紫')
  assert.equal(favorites.total, 1)
  assert.equal(reviews.items[0].status, 'pending')
  assert.deepEqual(transport.calls.filter(call => call.options).map(call => ({ method: call.method, path: call.path, auth: call.options.auth, data: call.data })), [
    { method: 'GET', path: '/me', auth: 'required', data: undefined },
    { method: 'GET', path: '/me/favorites', auth: 'required', data: { page: 1, page_size: 100 } },
    { method: 'GET', path: '/me/reviews', auth: 'required', data: { page: 1, page_size: 100 } },
    { method: 'POST', path: '/me/profile', auth: 'required', data: { nickname: '新昵称' } },
    { method: 'POST', path: '/favorites', auth: 'required', data: { course_id: fixtures.course.id } },
    { method: 'DELETE', path: '/favorites/course%2Fwith%20space', auth: 'required', data: undefined },
    { method: 'POST', path: '/auth/logout', auth: 'required', data: undefined }
  ])
})

test('download URLs accept only the configured HTTPS resource origin', () => {
  assert.equal(validDownloadUrl('https://resources.nkustudy.top/resources/test.pdf'), true)
  assert.equal(validDownloadUrl('http://resources.nkustudy.top/resources/test.pdf'), false)
  assert.equal(validDownloadUrl('https://example.com/resources/test.pdf'), false)
})

test('anonymous browsing has zero calls to unsupported or management endpoints', async () => {
  const transport = transportFixture()
  const api = createPublicApi(transport)
  await api.getHome()
  await api.getCourses({})
  await api.getCourseResources(fixtures.course.id)
  await api.getReviewGroups()
  const paths = transport.calls.map(call => call.path)
  assert.equal(paths.some(path => /admin|submissions|reports/.test(path)), false)
})