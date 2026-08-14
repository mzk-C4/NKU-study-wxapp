const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createApp } = require('../src/app')

const projectRoot = path.resolve(__dirname, '../..')
let server
let baseUrl
let temporaryDirectory

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers }
  })
  const body = await response.json()
  return { response, body }
}

async function login(code) {
  const { response, body } = await request('/api/v1/auth/wechat', { method: 'POST', body: JSON.stringify({ code }) })
  assert.equal(response.status, 200, JSON.stringify(body))
  assert.equal(body.code, 0)
  return body.data.token
}

test.before(async () => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'nkustudy-api-'))
  server = createApp({
    dbPath: path.join(temporaryDirectory, 'runtime.json'),
    seedPath: path.join(projectRoot, 'server/data/seed.json'),
    adminPath: path.join(projectRoot, 'admin/index.html'),
    adminLogoPath: path.join(projectRoot, 'assets/branding/nkustudy-avatar-v2-nankai-128.png'),
    tokenSecret: 'test-token-secret-with-enough-entropy',
    adminKey: 'test-admin-key',
    allowDevLogin: true
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

test.after(async () => {
  await new Promise(resolve => server.close(resolve))
  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
})

test('public course, resource, review and guide reads use the shared model', async () => {
  const home = await request('/api/v1/home')
  assert.equal(home.response.status, 200)
  assert.equal(home.body.code, 0)
  assert.ok(home.body.data.hot_courses.length)

  const course = await request('/api/v1/courses/course_probability')
  assert.equal(course.body.data.id, 'course_probability')
  assert.equal(course.body.data.offerings.length, 2)
  assert.equal(course.body.data.ratings.show_aggregate, true)
  assert.equal(course.body.data.ratings.average, 4.3)

  const resources = await request('/api/v1/courses/course_probability/resources')
  assert.equal(resources.body.data.total, 2)
  assert.equal(resources.body.data.items[0].share_url, undefined)

  const detail = await request('/api/v1/resources/resource_probability_exam_2024')
  assert.match(detail.body.data.share_url, /^https:/)
  assert.equal('academic_year' in detail.body.data, false)
  assert.equal('campus' in detail.body.data, false)

  const organic = await request('/api/v1/courses/course_organic_chemistry')
  assert.equal(organic.body.data.review_count, 2)
  assert.equal(organic.body.data.ratings.show_aggregate, false)

  const courseList = await request('/api/v1/courses?category=%E4%B8%93%E4%B8%9A%E5%9F%BA%E7%A1%80')
  assert.ok(courseList.body.data.facets.categories.includes('专业基础'))
  assert.ok(courseList.body.data.items.every(item => item.scope === '专业基础'))

  const guide = await request('/api/v1/guides/guide_course_selection')
  assert.equal(guide.body.data.steps[0].title, '第 1 步')
})

test('search index recalls all chemistry-related courses', async () => {
  const { body } = await request('/api/v1/search-index')
  const chemistryCourses = body.data.items.filter(item => item.type === 'course' && item.search_text.includes('化学')).map(item => item.id)
  assert.deepEqual(new Set(chemistryCourses), new Set(['course_organic_chemistry', 'course_environmental_chemistry']))
})

test('visitor writes require login, then favorites and submissions are private', async () => {
  const unauthorized = await request('/api/v1/favorites', { method: 'POST', body: JSON.stringify({ course_id: 'course_probability' }) })
  assert.equal(unauthorized.response.status, 401)

  const token = await login('student-a')
  const headers = { authorization: `Bearer ${token}` }
  const favorite = await request('/api/v1/favorites', { method: 'POST', headers, body: JSON.stringify({ course_id: 'course_probability' }) })
  assert.equal(favorite.response.status, 201)

  const submission = await request('/api/v1/resource-submissions', {
    method: 'POST', headers,
    body: JSON.stringify({ course_id: 'course_probability', title: '自测复习提纲', type: '笔记', storage_provider: '阿里云盘', share_url: 'https://example.com/student-a-notes', extraction_code: '', description: '已检查个人信息' })
  })
  assert.equal(submission.response.status, 201)
  assert.equal(submission.body.data.status, 'pending')

  const mine = await request('/api/v1/me/submissions', { headers })
  assert.equal(mine.body.data.total, 1)
  assert.equal(mine.body.data.items[0].share_url, undefined)
})

test('one user can submit only one active review per course and teacher', async () => {
  const token = await login('student-reviewer')
  const headers = { authorization: `Bearer ${token}` }
  const payload = { course_id: 'course_data_structures', teacher: '陈老师', rating: 5, tags: ['讲解清楚'], body: '课程结构清楚，作业能帮助理解算法复杂度，建议提前复习递归和指针基础。' }
  const first = await request('/api/v1/reviews', { method: 'POST', headers, body: JSON.stringify(payload) })
  assert.equal(first.response.status, 201)
  assert.equal(first.body.data.status, 'pending')
  const mine = await request('/api/v1/me/reviews', { headers })
  assert.equal(mine.body.data.items[0].rating, 5)
  assert.equal('difficulty' in mine.body.data.items[0], false)
  const duplicate = await request('/api/v1/reviews', { method: 'POST', headers, body: JSON.stringify(payload) })
  assert.equal(duplicate.response.status, 409)
})

test('admin key protects moderation and approvals publish content', async () => {
  const denied = await request('/api/v1/admin/summary')
  assert.equal(denied.response.status, 401)
  const headers = { 'x-admin-key': 'test-admin-key' }
  const submissions = await request('/api/v1/admin/submissions', { headers })
  const pending = submissions.body.data.items.find(item => item.title === '自测复习提纲')
  assert.ok(pending)
  const approved = await request(`/api/v1/admin/submissions/${pending.id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'approved', review_note: '' }) })
  assert.equal(approved.body.data.status, 'approved')

  const resources = await request('/api/v1/courses/course_probability/resources')
  assert.equal(resources.body.data.total, 3)

  const reviews = await request('/api/v1/admin/reviews', { headers })
  const pendingReview = reviews.body.data.items.find(item => item.status === 'pending')
  const published = await request(`/api/v1/admin/reviews/${pendingReview.id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'published', review_note: '' }) })
  assert.equal(published.body.data.status, 'published')
})

test('admin HTML and brand asset are served', async () => {
  const html = await fetch(`${baseUrl}/admin/`)
  assert.equal(html.status, 200)
  assert.match(await html.text(), /NKUStudy 内容管理/)
  const logo = await fetch(`${baseUrl}/admin-logo`)
  assert.equal(logo.status, 200)
  assert.equal(logo.headers.get('content-type'), 'image/png')
})
