const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const publicApi = require('../miniprogram/services/public-api')
const seed = require('../server/data/seed.json')
const { buildCoursePresentation, highlightText } = require('../miniprogram/pages/search/presentation')

const projectRoot = path.resolve(__dirname, '..')

function capturePage(relativePath) {
  const modulePath = require.resolve(path.join(projectRoot, relativePath))
  const previousPage = global.Page
  let definition
  global.Page = value => { definition = value }
  delete require.cache[modulePath]
  try {
    require(modulePath)
  } finally {
    delete require.cache[modulePath]
    if (previousPage === undefined) delete global.Page
    else global.Page = previousPage
  }
  return definition
}

function createPage(data = {}) {
  const page = {
    ...searchDefinition,
    data: { ...JSON.parse(JSON.stringify(searchDefinition.data)), ...data },
    _isUnloaded: false,
    _requestId: 0,
    _setDataCalls: []
  }
  page.setData = function setData(patch, callback) {
    this._setDataCalls.push(patch)
    Object.assign(this.data, patch)
    if (callback) callback.call(this)
  }
  return page
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function replaceMethod(t, object, key, implementation) {
  const original = object[key]
  object[key] = implementation
  t.after(() => { object[key] = original })
}

function installWx(t, implementation = {}) {
  const hadWx = Object.hasOwn(global, 'wx')
  const previousWx = global.wx
  global.wx = {
    showToast() {},
    showActionSheet() {},
    ...implementation
  }
  t.after(() => {
    if (hadWx) global.wx = previousWx
    else delete global.wx
  })
}

function course(id, overrides = {}) {
  return {
    id,
    name: `课程 ${id}`,
    summary: '',
    description: '',
    term: '大二上',
    group: '专业课',
    category_name: '专业课',
    tags: [],
    assessment: '考试',
    teachers: [],
    teacher_groups: [],
    resource_count: 0,
    review_count: 0,
    offering_count: 0,
    ratings: { average: null, count: 0, show_aggregate: false, label: '暂无评分' },
    updated: '',
    ...overrides
  }
}

function result(items, options = {}) {
  return {
    items,
    total: options.total == null ? items.length : options.total,
    page: options.page || 1,
    page_size: options.pageSize || 20,
    facets: options.facets || { groups: [], terms: [], tags: [], assessments: [] }
  }
}

const searchDefinition = capturePage('miniprogram/pages/search/index.js')

test('course-name search sends the formal first-page query and preserves server order', async t => {
  const calls = []
  replaceMethod(t, publicApi, 'getCourses', async query => {
    calls.push(query)
    return result([
      course('second', { name: '高等数学（二）' }),
      course('first', { name: '高等数学（一）' })
    ])
  })
  const page = createPage({ query: '  高等数学  ' })

  await page.search()

  assert.deepEqual(calls, [{
    page: 1,
    page_size: 20,
    q: '高等数学',
    term: '',
    group: '',
    tag: '',
    assessment: ''
  }])
  assert.deepEqual(page.data.results.map(item => item.id), ['second', 'first'])
})

test('teacher and tag queries still render course DTOs with honest match explanations', async t => {
  const responses = [
    result([course('teacher-course', { name: '概率论', teachers: ['张老师'] })]),
    result([course('tag-course', { name: '数据分析', tags: ['机器学习'] })])
  ]
  replaceMethod(t, publicApi, 'getCourses', async () => responses.shift())
  const page = createPage({ query: '张老师' })

  await page.search()
  assert.deepEqual(page.data.results.map(item => item.id), ['teacher-course'])
  assert.match(page.data.results[0].match_html, /^教师匹配：/)
  assert.equal(page.data.results[0].type, 'course')

  page.setData({ query: '机器学习' })
  await page.search()
  assert.deepEqual(page.data.results.map(item => item.id), ['tag-course'])
  assert.match(page.data.results[0].match_html, /^标签匹配：/)
  assert.equal(page.data.results[0].type, 'course')
})

test('term group tag and assessment are the only filter parameters sent by the page', async t => {
  let captured
  replaceMethod(t, publicApi, 'getCourses', async query => {
    captured = query
    return result([])
  })
  const page = createPage({
    query: '课程',
    term: '大二上',
    group: '专业课',
    tag: '数学',
    assessment: '考试',
    category: '禁止字段',
    sort: '禁止字段'
  })

  await page.search()

  assert.deepEqual(captured, {
    page: 1,
    page_size: 20,
    q: '课程',
    term: '大二上',
    group: '专业课',
    tag: '数学',
    assessment: '考试'
  })
  assert.equal(Object.keys(captured).every(key => publicApi.COURSE_QUERY_KEYS.includes(key)), true)
})

test('facets populate the four filter controls without hard-coded production values', async t => {
  const facets = {
    groups: ['通识必修课'],
    terms: ['大一下'],
    tags: ['数学'],
    assessments: ['绩点制']
  }
  replaceMethod(t, publicApi, 'getCourses', async () => result([course('facet-course')], { facets }))
  const page = createPage({ query: '课程' })

  await page.search()

  assert.deepEqual(page.data.groupOptions, facets.groups)
  assert.deepEqual(page.data.termOptions, facets.terms)
  assert.deepEqual(page.data.tagOptions, facets.tags)
  assert.deepEqual(page.data.assessmentOptions, facets.assessments)
  assert.deepEqual(page.data.tagChoices, ['不限', '数学'])
})

test('native facet selection applies a server-provided value and starts a new search', () => {
  const page = createPage({
    tagChoices: ['不限', '数学', '化学'],
    tagOptions: ['数学', '化学']
  })
  let searches = 0
  page.search = () => { searches += 1 }

  page.changeFacet({ currentTarget: { dataset: { key: 'tag' } }, detail: { value: '2' } })

  assert.equal(page.data.tag, '化学')
  assert.equal(page.data.tagChoiceIndex, 2)
  assert.equal(page.data.hasActiveFilters, true)
  assert.equal(searches, 1)
})

test('one filter can be cleared and all filters can be reset independently of the query', () => {
  const page = createPage({
    query: '化学',
    term: '大二上',
    group: '专业课',
    tag: '化学',
    assessment: '考试',
    hasActiveFilters: true
  })
  let searches = 0
  page.search = () => { searches += 1 }

  page.clearFilter({ currentTarget: { dataset: { key: 'tag' } } })
  assert.equal(page.data.tag, '')
  assert.equal(page.data.term, '大二上')
  assert.equal(page.data.hasActiveFilters, true)

  page.resetFilters()
  assert.deepEqual(
    [page.data.term, page.data.group, page.data.tag, page.data.assessment],
    ['', '', '', '']
  )
  assert.equal(page.data.query, '化学')
  assert.equal(page.data.hasActiveFilters, false)
  assert.equal(searches, 2)
})

test('a stale search success cannot overwrite the latest results', async t => {
  const pending = [deferred(), deferred()]
  let index = 0
  replaceMethod(t, publicApi, 'getCourses', () => pending[index++].promise)
  const page = createPage({ query: '旧搜索' })

  const oldSearch = page.search()
  page.setData({ query: '新搜索' })
  const latestSearch = page.search()
  pending[1].resolve(result([course('latest')]))
  await latestSearch
  pending[0].resolve(result([course('stale')]))
  await oldSearch

  assert.deepEqual(page.data.results.map(item => item.id), ['latest'])
  assert.equal(page.data.loading, false)
})

test('a stale search failure cannot clear the current loading state or expose its details', async t => {
  const pending = [deferred(), deferred()]
  let index = 0
  replaceMethod(t, publicApi, 'getCourses', () => pending[index++].promise)
  const page = createPage({ query: '旧搜索' })

  const oldSearch = page.search()
  page.setData({ query: '新搜索' })
  const latestSearch = page.search()
  pending[0].reject(new Error('https://private-provider.example/token=secret'))
  await oldSearch

  assert.equal(page.data.loading, true)
  assert.equal(page.data.error, '')

  pending[1].resolve(result([course('latest')]))
  await latestSearch
  assert.deepEqual(page.data.results.map(item => item.id), ['latest'])
})

test('a new search invalidates an older load-more response', async t => {
  const pending = [deferred(), deferred()]
  const calls = []
  replaceMethod(t, publicApi, 'getCourses', query => {
    calls.push(query)
    return pending[calls.length - 1].promise
  })
  const page = createPage({
    query: '旧搜索',
    results: [buildCoursePresentation(course('old-first'), '旧搜索')],
    total: 40,
    page: 1,
    hasMore: true,
    loading: false,
    hasSearched: true
  })

  const oldAppend = page.loadCourses({ append: true })
  page.setData({ query: '新搜索' })
  const newSearch = page.search()
  pending[1].resolve(result([course('new-first')]))
  await newSearch
  pending[0].resolve(result([course('old-second')], { total: 40, page: 2 }))
  await oldAppend

  assert.deepEqual(calls.map(call => [call.q, call.page]), [['旧搜索', 2], ['新搜索', 1]])
  assert.deepEqual(page.data.results.map(item => item.id), ['new-first'])
})

test('an in-flight response cannot call setData after page unload', async t => {
  const pending = deferred()
  replaceMethod(t, publicApi, 'getCourses', () => pending.promise)
  const page = createPage({ query: '课程' })

  const request = page.search()
  page.onUnload()
  const callsAtUnload = page._setDataCalls.length
  pending.resolve(result([course('late')]))
  await request

  assert.equal(page._setDataCalls.length, callsAtUnload)
  assert.deepEqual(page.data.results, [])
})

test('pagination appends in server order, removes duplicate courses and reaches no-more state', async t => {
  const calls = []
  replaceMethod(t, publicApi, 'getCourses', async query => {
    calls.push(query)
    if (query.page === 1) return result([course('a'), course('b')], { total: 3, page: 1, pageSize: 2 })
    return result([course('b'), course('c')], { total: 3, page: 2, pageSize: 2 })
  })
  const page = createPage({ query: '课程', pageSize: 2 })

  await page.search()
  assert.deepEqual(page.data.results.map(item => item.id), ['a', 'b'])
  assert.equal(page.data.hasMore, true)

  await page.loadCourses({ append: true })
  assert.deepEqual(calls.map(call => call.page), [1, 2])
  assert.deepEqual(page.data.results.map(item => item.id), ['a', 'b', 'c'])
  assert.equal(page.data.hasMore, false)
  assert.equal(page.data.loadingMore, false)
})

test('network errors use a fixed recovery message and retry the current search', async t => {
  let attempts = 0
  replaceMethod(t, publicApi, 'getCourses', async () => {
    attempts += 1
    if (attempts === 1) {
      const error = new Error('request:fail https://private-provider.example')
      error.code = 'NETWORK_ERROR'
      error.kind = 'network_error'
      throw error
    }
    return result([course('recovered')])
  })
  const page = createPage({ query: '课程' })

  await page.search()
  assert.equal(page.data.error, '网络连接失败，请检查网络后重试。')
  assert.doesNotMatch(page.data.error, /https?:|provider|request:fail/i)

  await page.retry()
  assert.deepEqual(page.data.results.map(item => item.id), ['recovered'])
  assert.equal(page.data.error, '')
})

test('initial idle and searched-empty are separate states', async t => {
  replaceMethod(t, publicApi, 'getCourses', async () => result([]))
  const page = createPage({ loading: false })

  page.enterIdle()
  assert.equal(page.data.idle, true)
  assert.equal(page.data.hasSearched, false)
  assert.deepEqual(page.data.results, [])

  page.setData({ query: '不存在的课程' })
  await page.search()
  assert.equal(page.data.idle, false)
  assert.equal(page.data.hasSearched, true)
  assert.equal(page.data.total, 0)
  assert.deepEqual(page.data.results, [])
})

test('local chemistry fixture recalls all related seed courses and a tag-only course', async t => {
  const seedCourses = seed.courses.map(item => course(item.id, {
    name: item.name,
    summary: item.description,
    description: item.description,
    term: item.recommended_stage,
    group: item.requirement_type,
    category_name: item.requirement_type,
    tags: item.tags,
    assessment: '',
    teachers: []
  }))
  const tagOnlyCourse = course('course_chemistry_tag_only', {
    name: '实验安全基础',
    summary: '实验室规范与风险识别。',
    tags: ['化学', '实验安全']
  })
  const fixture = [...seedCourses, tagOnlyCourse]
  replaceMethod(t, publicApi, 'getCourses', async query => {
    const needle = query.q.toLocaleLowerCase()
    const items = fixture.filter(item => [
      item.name,
      item.summary,
      item.term,
      item.group,
      item.assessment,
      ...item.tags,
      ...item.teachers
    ].some(value => String(value || '').toLocaleLowerCase().includes(needle)))
    return result(items)
  })
  const expectedSeedIds = seedCourses
    .filter(item => [item.name, item.summary, item.term, item.group, ...item.tags].some(value => String(value || '').includes('化学')))
    .map(item => item.id)
  const page = createPage({ query: '化学' })

  await page.search()

  assert.deepEqual(expectedSeedIds, ['course_organic_chemistry', 'course_environmental_chemistry'])
  assert.deepEqual(page.data.results.map(item => item.id), [...expectedSeedIds, 'course_chemistry_tag_only'])
  assert.match(page.data.results.at(-1).match_html, /^标签匹配：/)
})

test('highlighting locates plain text first and separately escapes every rendered segment', () => {
  const value = '<script>"CHEMISTRY" & \'course\'</script>'
  const highlighted = highlightText(value, 'chemistry')
  const presented = buildCoursePresentation(course('unsafe', { name: value }), 'chemistry')

  assert.equal(highlighted.matched, true)
  assert.match(highlighted.html, /^&lt;script&gt;&quot;<span [^>]+>CHEMISTRY<\/span>&quot; &amp; &#39;course&#39;&lt;\/script&gt;$/)
  assert.doesNotMatch(highlighted.html, /<script>|<\/script>/)
  assert.equal(presented.highlighted_name, highlighted.html)
  assert.match(presented.match_html, /^课程名匹配：&lt;script&gt;/)
})

test('formal search runtime has no direct request, unopened endpoint, Fuse or legacy DTO dependency', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/search/index.js'), 'utf8')
  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/search/index.wxml'), 'utf8')

  assert.doesNotMatch(source, /wx\.request|utils\/request|searchCourses|search-engine|Fuse/)
  assert.doesNotMatch(source, /search-index|guides|resources/)
  assert.doesNotMatch(source, /short_name|aliases/)
  assert.match(source, /publicApi\.getCourses\(query\)/)
  assert.match(template, /maxlength="80"/)
  assert.match(template, /bindretry="retry"/)
})

test('search result cards fill the page and the clear action stays inside the search field', () => {
  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/search/index.wxml'), 'utf8')
  const style = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/search/index.wxss'), 'utf8')

  assert.match(template, /<view class="search-box search-input">[^]*<input\b[^>]*\/>\s*<button\b[^>]*class="search-clear"[^>]*>×<\/button>\s*<\/view>/)
  assert.match(template, /class="search-clear"[^>]*aria-label="清除搜索词"/)
  assert.doesNotMatch(template, />清除搜索词<\/button>/)
  assert.match(style, /\.search-input\s*\{[^}]*width:\s*100%;/)
  assert.match(style, /\.search-clear\s*\{[^}]*border-radius:\s*50%;/)
  assert.match(style, /\.result-card\s*\{[^}]*width:\s*100%\s*!important;/)
  assert.match(style, /\.result-card\s*\{[^}]*min-width:\s*100%;/)
  assert.match(style, /\.result-card\s*\{[^}]*max-width:\s*100%;/)
  assert.match(style, /\.result-card\s*\{[^}]*margin:\s*0 0 20rpx\s*!important;/)
})
