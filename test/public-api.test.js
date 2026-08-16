const test = require('node:test')
const assert = require('node:assert/strict')

const request = require('../miniprogram/utils/request')
const publicApi = require('../miniprogram/services/public-api')

function responseWx(statusCode, data) {
  return {
    request(options) { options.success({ statusCode, data }) }
  }
}

function failingWx() {
  return {
    request(options) { options.fail({ errMsg: 'request:fail url not in domain list' }) }
  }
}

function forbiddenKeys(value, keys, found = []) {
  if (!value || typeof value !== 'object') return found
  for (const [key, child] of Object.entries(value)) {
    if (keys.has(key)) found.push(key)
    forbiddenKeys(child, keys, found)
  }
  return found
}

test('request transport accepts production success envelopes without message', async () => {
  const transport = request.createRequestTransport(responseWx(200, { code: 0, data: { status: 'ok' } }))
  assert.deepEqual(await transport.get('/health'), { status: 'ok' })
})

test('request transport preserves string codes and classifies stable error statuses', async () => {
  const cases = [
    [400, 'INVALID_REVIEW', 'invalid_request'],
    [404, 'COURSE_NOT_FOUND', 'not_found'],
    [409, 'SUBMISSION_CLOSED', 'conflict'],
    [429, 'RATE_LIMITED', 'rate_limited'],
    [500, 'INTERNAL_ERROR', 'server_error'],
    [503, 'INTERNAL_ERROR', 'unavailable']
  ]
  for (const [statusCode, code, kind] of cases) {
    const transport = request.createRequestTransport(responseWx(statusCode, { code, message: '安全提示。' }))
    await assert.rejects(transport.get('/health'), error => {
      assert.equal(error.statusCode, statusCode)
      assert.equal(error.code, code)
      assert.equal(error.kind, kind)
      assert.equal(error.message, '安全提示。')
      return true
    })
  }
})

test('request transport hides unsafe server details and network provider text', async () => {
  const unsafe = request.createRequestTransport(responseWx(500, { code: 'INTERNAL_ERROR', message: 'failed at C:\\secret\\stack token=abc' }))
  await assert.rejects(unsafe.get('/home'), error => error.message === '服务暂时不可用，请稍后再试。')

  const network = request.createRequestTransport(failingWx())
  await assert.rejects(network.get('/home'), error => {
    assert.equal(error.code, 'NETWORK_ERROR')
    assert.equal(error.kind, 'network_error')
    assert.equal(error.message.includes('domain list'), false)
    return true
  })
})

test('course queries whitelist production parameters and cap page_size at 100', () => {
  const query = publicApi.buildCourseQuery({
    q: ' 概率论 ', term: '大一下', group: '通识必修课', tag: '数学', assessment: '绩点制',
    page: 0, page_size: 500, query: 'legacy', category: 'A', requirement_type: '旧属性', sort: 'reviews'
  })
  assert.deepEqual(query, {
    page: 1,
    page_size: 100,
    q: '概率论',
    term: '大一下',
    group: '通识必修课',
    tag: '数学',
    assessment: '绩点制'
  })
  assert.equal(Object.keys(query).every(key => publicApi.COURSE_QUERY_KEYS.includes(key)), true)
})

test('adapter encodes dynamic paths and keeps production query names', async () => {
  const calls = []
  const client = {
    async get(path, data) {
      calls.push({ path, data })
      if (path === '/courses') return { items: [], total: 0, page: 1, page_size: 20, facets: {} }
      return { id: 'course-id', name: '课程' }
    }
  }
  const api = publicApi.createPublicApi(client, { envVersion: 'release' })
  await api.getCourse('课程/一 ?')
  await api.getCourseResources('课程/一 ?')
  await api.searchCourses('概率', { page_size: 999, category: 'A' })

  assert.equal(calls[0].path, '/courses/%E8%AF%BE%E7%A8%8B%2F%E4%B8%80%20%3F')
  assert.equal(calls[1].path, '/courses/%E8%AF%BE%E7%A8%8B%2F%E4%B8%80%20%3F/resources')
  assert.deepEqual(calls[2].data, { page: 1, page_size: 100, q: '概率' })
})

test('course, resource and review DTOs use explicit public-field whitelists', () => {
  const forbidden = new Set([
    'basePath', 'path', 'resourceRoot', 'source', 'repository', 'revision', 'review_status',
    'ipHash', 'actorHash', 'userAgent', 'contact', 'contributors', 'admin', 'r2Bucket'
  ])
  const course = publicApi.mapCourse({
    id: 'course-id', name: '课程', summary: '摘要', description: '描述', term: '大一下', group: '通识课', category_name: '通识课',
    tags: ['数学'], assessment: '绩点制', teachers: ['张老师'],
    teacher_groups: [{ id: 'group-id', group_key: 'group-id', teacher_name: '张老师', teacher_name_short: '张', review_count: 2, revision: 'hidden' }],
    resource_count: 3, review_count: 2, offering_count: 1,
    ratings: { average: 4.5, count: 2, show_aggregate: true, actorHash: 'hidden' }, updated: '2026-08-15',
    basePath: 'internal/path', resourceRoot: 'secret', source: 'repo', revision: 'hidden', contact: 'hidden'
  })
  const resource = publicApi.mapResource({
    id: 'resource-id', course_id: 'course-id', course_name: '课程', title: '试题.pdf', size: 12, size_label: '12 B',
    description: '试题', section: '真题', type: '真题', term_label: '大一下', extension: 'pdf',
    download_url: 'https://resources.nkustudy.top/resources/file.pdf', path: 'internal/file.pdf', r2Bucket: 'hidden'
  })
  const reviewGroup = publicApi.mapReviewGroup({
    group_key: 'group-id', course_id: 'course-id', course_name: '课程', teacher_name: '张老师', matched: true,
    review_count: 1, rating_average: 5, revision: 'hidden',
    items: [{ id: 'review-id', teacher_name: '张老师', rating: 5, tags: ['清晰'], body: '内容', helpful_count: 1, created_at: '2026-08-15', ipHash: 'hidden', userAgent: 'hidden' }]
  }, true)

  assert.deepEqual(forbiddenKeys(course, forbidden), [])
  assert.deepEqual(forbiddenKeys(resource, forbidden), [])
  assert.deepEqual(forbiddenKeys(reviewGroup, forbidden), [])
  assert.deepEqual(Object.keys(course).sort(), [
    'assessment', 'category_name', 'description', 'group', 'id', 'name', 'offering_count', 'ratings',
    'resource_count', 'review_count', 'summary', 'tags', 'teacher_groups', 'teachers', 'term', 'updated'
  ])
})

test('resource downloads require HTTPS and the exact production resource host', () => {
  assert.equal(publicApi.validateResourceDownloadUrl('https://resources.nkustudy.top/resources/file.pdf'), 'https://resources.nkustudy.top/resources/file.pdf')
  for (const value of [
    'http://resources.nkustudy.top/resources/file.pdf',
    'https://evil.resources.nkustudy.top/resources/file.pdf',
    'https://resources.nkustudy.top.evil.example/resources/file.pdf',
    'https://resources.nkustudy.top:444/resources/file.pdf',
    'https://user@resources.nkustudy.top/resources/file.pdf',
    'https://resources.nkustudy.top\\resources\\file.pdf'
  ]) assert.equal(publicApi.validateResourceDownloadUrl(value), '')
})

test('develop compatibility stays inside adapter and does not recreate legacy UI fields', async () => {
  const calls = []
  const client = {
    async get(path, data) {
      calls.push({ path, data })
      return {
        items: [{
          id: 'legacy-course', name: '旧参考课程', description: '本地摘要', requirement_type: '公共必修', recommended_stage: '大一', category_code: 'A',
          tags: ['本地'], resource_count: 1, review_count: 1,
          offerings: [{ id: 'offering-id', teacher_name: '李老师', teacher_name_short: '李', review_count: 1 }],
          ratings: { difficulty: 3, workload: 4, gain: 5, recommend: 5, show_aggregate: true }
        }],
        total: 1,
        page: 1,
        page_size: 20
      }
    }
  }
  const api = publicApi.createPublicApi(client, { envVersion: 'develop' })
  const result = await api.getCourses({ q: '旧参考', group: '不会伪映射', page_size: 200 })
  const groups = await api.getReviewGroups()

  assert.deepEqual(calls[0], { path: '/courses', data: { page: 1, page_size: 100, query: '旧参考' } })
  assert.equal(result.items[0].group, '公共必修')
  assert.equal(result.items[0].term, '大一')
  assert.equal(result.items[0].ratings.average, null)
  assert.equal(Object.hasOwn(result.items[0], 'category_code'), false)
  assert.deepEqual(groups, { items: [], total: 0, available: false })
  assert.equal(calls.length, 1)
})
