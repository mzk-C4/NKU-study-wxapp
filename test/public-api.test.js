const test = require('node:test')
const assert = require('node:assert/strict')

const publicApi = require('../miniprogram/services/public-api')

function forbiddenKeys(value, keys, found = []) {
  if (!value || typeof value !== 'object') return found
  for (const [key, child] of Object.entries(value)) {
    if (keys.has(key)) found.push(key)
    forbiddenKeys(child, keys, found)
  }
  return found
}

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
  const api = publicApi.createPublicApi(client, { apiProfile: 'production' })
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
    id: 'course-id', name: '课程', short_name: '课', aliases: ['课程别名'], summary: '摘要', description: '描述', term: '大一下', group: '通识课', category_name: '通识课',
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
    'aliases', 'assessment', 'category_name', 'description', 'group', 'id', 'name', 'offering_count', 'ratings',
    'resource_count', 'review_count', 'short_name', 'summary', 'tags', 'teacher_groups', 'teachers', 'term', 'updated'
  ])
  assert.equal(course.short_name, '课')
  assert.deepEqual(course.aliases, ['课程别名'])
})

test('search index maps four public types, drops invalid items and never leaks raw fields', async () => {
  const privateFields = {
    basePath: 'internal/path', path: 'private/file', resourceRoot: 'secret', revision: 'hidden',
    review_status: 'approved', contact: 'private', admin: { token: 'hidden' }
  }
  const raw = {
    version: 'index-version',
    generated_at: '2026-08-16T04:00:00.000Z',
    items: [
      { id: 'course-id', type: 'course', type_label: '课', badge: '课', name: '有机化学', short_name: '有机', aliases: ['有机化学基础'], tags: ['化学'], teachers: ['张老师'], search_text: '课程摘要', subtitle: '专业课', ...privateFields },
      { id: 'teacher-id', type: 'teacher', type_label: '师', badge: '师', name: '张老师', teachers: ['张老师'], related_course_ids: ['must-not-pass'], ...privateFields },
      { id: 'resource-id', type: 'resource', type_label: '资', badge: '资', name: '期末试题.pdf', course_id: 'course-id', course_name: '有机化学', resource_type: '往年真题', term_label: '大二上', download_url: 'https://private.example/file', ...privateFields },
      { id: 'guide-id', type: 'guide', type_label: '指', badge: '指', name: '退补选流程', category: 'add-drop', updated_at: '2026-08-16', correction_url: 'https://private.example/correct', ...privateFields },
      { id: 'unknown-id', type: 'admin', name: '后台记录', ...privateFields },
      { id: '', type: 'course', name: '缺少稳定编号' },
      { id: 'missing-name', type: 'course', name: '' }
    ]
  }
  const calls = []
  const api = publicApi.createPublicApi({
    async get(path, query) {
      calls.push({ path, query })
      return raw
    }
  }, { apiProfile: 'production' })

  const result = await api.getSearchIndex()

  assert.deepEqual(calls, [{ path: '/search-index', query: undefined }])
  assert.equal(result.version, raw.version)
  assert.equal(result.generated_at, raw.generated_at)
  assert.equal(result.total, 4)
  assert.deepEqual(result.items.map(item => item.type), ['course', 'teacher', 'resource', 'guide'])
  assert.deepEqual(result.items[0], {
    id: 'course-id', type: 'course', type_label: '课', badge: '课', name: '有机化学', short_name: '有机',
    aliases: ['有机化学基础'], tags: ['化学'], teachers: ['张老师'], search_text: '课程摘要', subtitle: '专业课'
  })
  assert.deepEqual(
    Object.fromEntries(['course_id', 'course_name', 'resource_type', 'term_label'].map(key => [key, result.items[2][key]])),
    { course_id: 'course-id', course_name: '有机化学', resource_type: '往年真题', term_label: '大二上' }
  )
  assert.equal(result.items[3].category, 'add-drop')
  assert.equal(result.items[3].updated_at, '2026-08-16')
  assert.deepEqual(forbiddenKeys(result, new Set([...Object.keys(privateFields), 'download_url', 'correction_url', 'related_course_ids'])), [])
})

test('guide queries and dynamic paths use the formal whitelist and strict DTO mapping', async () => {
  assert.deepEqual(publicApi.buildGuidesQuery({
    category: 'add-drop', page: 2, page_size: 500, q: 'forbidden', sort: 'forbidden'
  }), { page: 2, page_size: 100, category: 'add-drop' })
  assert.deepEqual(publicApi.buildGuidesQuery({
    category: 'campus-life', page: 0, page_size: 0
  }), { page: 1, page_size: 20 })

  const calls = []
  const client = {
    async get(path, query) {
      calls.push({ path, query })
      if (path === '/guides') {
        return {
          items: [{
            id: 'guide-id', title: '退补选流程', summary: '摘要', category: 'add-drop', updated_at: '2026-08-16',
            applicable_scope: '本科生', related_course_ids: ['course-id'], basePath: 'hidden', correction_url: 'hidden'
          }, { id: '', title: '无效项' }],
          total: 1, page: 2, page_size: 100,
          facets: { categories: ['add-drop', 'campus-life', 'add-drop'], revision: 'hidden' },
          data_updated_at: '2026-08-16T04:00:00.000Z', revision: 'hidden'
        }
      }
      return {
        id: 'guide-id', title: '退补选流程', summary: '摘要', category: 'add-drop', updated_at: '2026-08-16',
        applicable_scope: '本科生',
        steps: [{ title: '第一步', body: '查看通知', revision: 'hidden' }, { title: '', body: '' }],
        related_courses: [{ id: 'course-id', name: '有机化学', path: 'hidden' }, { id: '', name: '无效课程' }],
        source_title: '教务处通知', source_url: 'https://jwc.nankai.edu.cn/notice',
        correction_url: 'https://nkustudy.top/feedback?guide=guide-id', revision: 'hidden', contact: 'hidden'
      }
    }
  }
  const api = publicApi.createPublicApi(client, { apiProfile: 'production' })

  const list = await api.getGuides({ category: 'add-drop', page: 2, page_size: 999, sort: 'forbidden' })
  const detail = await api.getGuide('指南/一 ?')

  assert.deepEqual(calls, [
    { path: '/guides', query: { page: 2, page_size: 100, category: 'add-drop' } },
    { path: '/guides/%E6%8C%87%E5%8D%97%2F%E4%B8%80%20%3F', query: undefined }
  ])
  assert.deepEqual(list, {
    items: [{
      id: 'guide-id', title: '退补选流程', summary: '摘要', category: 'add-drop', updated_at: '2026-08-16',
      applicable_scope: '本科生', related_course_ids: ['course-id']
    }],
    total: 1, page: 2, page_size: 100, facets: { categories: ['add-drop'] }, data_updated_at: '2026-08-16T04:00:00.000Z'
  })
  assert.deepEqual(detail.steps, [{ title: '第一步', body: '查看通知' }])
  assert.deepEqual(detail.related_courses, [{ id: 'course-id', name: '有机化学' }])
  assert.equal(detail.source_url, 'https://jwc.nankai.edu.cn/notice')
  assert.equal(detail.correction_url, 'https://nkustudy.top/feedback?guide=guide-id')
  assert.deepEqual(forbiddenKeys({ list, detail }, new Set(['basePath', 'path', 'revision', 'contact'])), [])
})

test('guide source and correction links reject unsafe HTTPS lookalikes', () => {
  assert.equal(publicApi.validatePublicHttpsUrl('https://jwc.nankai.edu.cn/notice?a=1#top'), 'https://jwc.nankai.edu.cn/notice?a=1#top')
  for (const value of [
    'http://jwc.nankai.edu.cn/notice',
    'https://user:password@jwc.nankai.edu.cn/notice',
    'https://user@jwc.nankai.edu.cn/notice',
    ' https://jwc.nankai.edu.cn/notice',
    'https://jwc.nankai.edu.cn/notice ',
    'https://jwc.nankai.edu.cn/notice path',
    'https://jwc.nankai.edu.cn\\notice',
    'https:///missing-host'
  ]) assert.equal(publicApi.validatePublicHttpsUrl(value), '')

  const mapped = publicApi.mapGuide({
    id: 'guide', title: '指南', source_url: 'https://user@private.example/source', correction_url: ' https://private.example/correct'
  })
  assert.equal(mapped.source_url, '')
  assert.equal(mapped.correction_url, '')
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

test('reference compatibility stays inside adapter and does not recreate legacy UI fields', async () => {
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
  const api = publicApi.createPublicApi(client, { apiProfile: 'reference' })
  const result = await api.getCourses({ q: '旧参考', group: '不会伪映射', page_size: 200 })
  const groups = await api.getReviewGroups()

  assert.deepEqual(calls[0], { path: '/courses', data: { page: 1, page_size: 100, query: '旧参考' } })
  assert.equal(result.items[0].group, '公共必修')
  assert.equal(result.items[0].term, '大一')
  assert.equal(result.items[0].ratings.average, null)
  assert.equal(result.items[0].short_name, '')
  assert.deepEqual(result.items[0].aliases, [])
  assert.equal(Object.hasOwn(result.items[0], 'category_code'), false)
  assert.deepEqual(groups, { items: [], total: 0, available: false })
  assert.equal(calls.length, 1)
})

test('production profile stays formal even when the caller is running in develop', async () => {
  const calls = []
  const client = {
    async get(path, data) {
      calls.push({ path, data })
      if (path === '/courses') return { items: [], total: 0, page: 1, page_size: 20, facets: {} }
      if (path === '/review-groups') return { items: [], total: 0 }
      return { group_key: 'group', items: [] }
    }
  }
  const api = publicApi.createPublicApi(client, { envVersion: 'develop', apiProfile: 'production' })

  await api.getCourses({ q: '化学' })
  const groups = await api.getReviewGroups()
  await api.getReviewGroup('group')

  assert.deepEqual(calls[0], { path: '/courses', data: { page: 1, page_size: 20, q: '化学' } })
  assert.equal(groups.available, true)
  assert.deepEqual(calls.slice(1).map(call => call.path), ['/review-groups', '/review-groups/group'])
})
