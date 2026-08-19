const test = require('node:test')
const assert = require('node:assert/strict')
const fixtures = require('./fixtures/public-api')
const { adaptCourse, adaptResourceList, createPublicApi } = require('../miniprogram/services/public-api')
const { validDownloadUrl } = require('../miniprogram/utils/resource-download')

function transportFixture() {
  const calls = []
  return {
    calls,
    async get(path, data) {
      calls.push({ method: 'GET', path, data })
      if (path === '/home') return fixtures.home
      if (path === '/courses') return fixtures.courses
      if (path.endsWith('/resources')) return fixtures.resources
      if (path === `/courses/${fixtures.course.id}`) return fixtures.course
      if (path === '/review-groups') return { items: [fixtures.reviewGroup], total: 1 }
      if (path === '/review-groups/group-key') return fixtures.reviewGroup
      throw new Error(`unexpected GET ${path}`)
    },
    async post(path, data) { calls.push({ method: 'POST', path, data }); return { submitted: true, pending: true } }
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
  assert.deepEqual(transport.calls.at(-1), { method: 'POST', path: '/reviews', data: { course_id: course.id, teacher: '张老师', rating: 5, tags: ['讲解清晰'], body: '正文', anonymous: true } })
})

test('download URLs accept only the configured HTTPS resource origin', () => {
  assert.equal(validDownloadUrl('https://resources.nkustudy.top/resources/test.pdf'), true)
  assert.equal(validDownloadUrl('http://resources.nkustudy.top/resources/test.pdf'), false)
  assert.equal(validDownloadUrl('https://example.com/resources/test.pdf'), false)
})

test('public client has zero calls to unsupported or management endpoints', async () => {
  const transport = transportFixture()
  const api = createPublicApi(transport)
  await api.getHome()
  await api.getCourses({})
  await api.getCourseResources(fixtures.course.id)
  await api.getReviewGroups()
  const paths = transport.calls.map(call => call.path)
  assert.equal(paths.some(path => /admin|auth|favorites|submissions|reports|\/me\//.test(path)), false)
})
