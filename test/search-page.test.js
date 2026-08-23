const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const publicApi = require('../miniprogram/services/public-api')
const navigation = require('../miniprogram/utils/navigation')
const { createSearchEngine } = require('../miniprogram/utils/search-engine')
const { buildCoursePresentation, buildSearchPresentation, highlightText } = require('../miniprogram/pages/search/presentation')

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
    _indexRequestId: 0,
    _matchedResults: [],
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

function flush() {
  return new Promise(resolve => setImmediate(resolve))
}

function replaceMethod(t, object, key, implementation) {
  const original = object[key]
  object[key] = implementation
  t.after(() => { object[key] = original })
}

function installWx(t, implementation = {}) {
  const hadWx = Object.hasOwn(global, 'wx')
  const previousWx = global.wx
  global.wx = { showToast() {}, navigateTo() {}, ...implementation }
  t.after(() => {
    if (hadWx) global.wx = previousWx
    else delete global.wx
  })
}

function course(id, overrides = {}) {
  return {
    id,
    name: `课程 ${id}`,
    short_name: '',
    aliases: [],
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

function courseResult(items, options = {}) {
  return {
    items,
    total: options.total == null ? items.length : options.total,
    page: options.page || 1,
    page_size: options.pageSize || 20,
    facets: options.facets || { groups: [], terms: [], tags: [], assessments: [] }
  }
}

function item(type, id, name, overrides = {}) {
  return {
    id,
    type,
    type_label: { course: '课', teacher: '师', resource: '资', guide: '指' }[type],
    badge: { course: '课', teacher: '师', resource: '资', guide: '指' }[type],
    name,
    short_name: '',
    aliases: [],
    tags: [],
    teachers: [],
    search_text: '',
    subtitle: '',
    ...overrides
  }
}

function indexSnapshot(items) {
  return {
    version: 'fixture-v1',
    generated_at: '2026-08-18T00:00:00.000Z',
    items,
    total: items.length
  }
}

const chemistryItems = [
  item('course', 'course-organic', '有机化学', { short_name: '有化', aliases: ['有机化学基础'], tags: ['化学'], teachers: ['陈老师'], search_text: '专业必修' }),
  item('course', 'course-environmental', '环境化学', { tags: ['环境', '化学'], search_text: '环境科学' }),
  item('teacher', 'teacher-chemistry', '化学实验教师', { tags: ['化学'], teachers: ['化学实验教师'], search_text: '实验课程' }),
  item('resource', 'resource-paper', '期末试题.pdf', { course_id: 'course-organic', course_name: '有机化学', resource_type: '往年真题', term_label: '大二上', tags: ['化学'], search_text: '有机化学 期末试题' }),
  item('guide', 'guide-chemistry', '化学实验选课指南', { category: 'course-selection', updated_at: '2026-08-18', search_text: '实验选课' }),
  item('course', 'course-unrelated', '中级微观经济学', { tags: ['经济'], search_text: '数字化转型 深度学习' })
]

const searchDefinition = capturePage('miniprogram/pages/search/index.js')

test('initial load fetches one search-index snapshot and later input stays local', async t => {
  let indexCalls = 0
  let courseCalls = 0
  replaceMethod(t, publicApi, 'getSearchIndex', async () => {
    indexCalls += 1
    return indexSnapshot(chemistryItems)
  })
  replaceMethod(t, publicApi, 'getCourses', async () => {
    courseCalls += 1
    return courseResult([], { facets: { groups: ['专业课'], terms: [], tags: ['化学'], assessments: [] } })
  })
  const page = createPage()

  await page.onLoad({ q: '化学' })
  page.setData({ query: '有机' })
  await page.search()
  page.setData({ query: '环境' })
  await page.search()

  assert.equal(indexCalls, 1)
  assert.equal(courseCalls, 1)
  assert.equal(page.data.mode, 'global')
  assert.deepEqual(page.data.results.map(result => result.id), ['course-environmental'])
  assert.equal(page.data.indexVersion, 'fixture-v1')
})

test('four result types expose counts and collision-safe type:id keys', async t => {
  replaceMethod(t, publicApi, 'getSearchIndex', async () => indexSnapshot(chemistryItems))
  replaceMethod(t, publicApi, 'getCourses', async () => courseResult([]))
  const page = createPage()

  await page.onLoad({ q: '化学' })

  assert.equal(new Set(page.data.results.map(result => result.type)).size, 4)
  assert.equal(page.data.results.every(result => result.key === `${result.type}:${result.id}`), true)
  assert.deepEqual(
    Object.fromEntries(page.data.typeTabs.slice(1).map(tab => [tab.type, tab.count])),
    { course: 2, teacher: 1, resource: 1, guide: 1 }
  )
})

test('local results show 20 at a time and reaching bottom never requests the index again', async t => {
  const many = Array.from({ length: 45 }, (_, index) => item('course', `course-${index}`, `化学课程 ${index}`))
  let indexCalls = 0
  replaceMethod(t, publicApi, 'getSearchIndex', async () => {
    indexCalls += 1
    return indexSnapshot(many)
  })
  replaceMethod(t, publicApi, 'getCourses', async () => courseResult([]))
  const page = createPage()

  await page.onLoad({ q: '化学' })
  assert.equal(page.data.results.length, 20)
  assert.equal(page.data.hasMore, true)

  page.onReachBottom()
  assert.equal(page.data.results.length, 40)
  page.onReachBottom()
  assert.equal(page.data.results.length, 45)
  assert.equal(page.data.hasMore, false)
  assert.equal(indexCalls, 1)
})

test('type switching filters locally and resets the visible batch', async t => {
  replaceMethod(t, publicApi, 'getSearchIndex', async () => indexSnapshot(chemistryItems))
  replaceMethod(t, publicApi, 'getCourses', async () => courseResult([]))
  const page = createPage()

  await page.onLoad({ q: '化学' })
  page.setData({ visibleLimit: 40 })
  page.changeType({ currentTarget: { dataset: { type: 'resource' } } })

  assert.equal(page.data.selectedType, 'resource')
  assert.equal(page.data.visibleLimit, 20)
  assert.deepEqual(page.data.results.map(result => result.key), ['resource:resource-paper'])
  assert.equal(page.data.typeTabs.find(tab => tab.type === 'resource').active, true)
})

test('teacher results refine the same index to courses instead of opening a fake detail page', async t => {
  const items = [
    item('teacher', 'teacher-chen', '陈老师', { teachers: ['陈老师'] }),
    item('course', 'course-organic', '有机化学', { teachers: ['陈老师'] }),
    item('course', 'course-other', '大学物理', { teachers: ['李老师'] })
  ]
  replaceMethod(t, publicApi, 'getSearchIndex', async () => indexSnapshot(items))
  replaceMethod(t, publicApi, 'getCourses', async () => courseResult([]))
  let navigationCalls = 0
  replaceMethod(t, navigation, 'openCourse', () => { navigationCalls += 1 })
  const page = createPage()

  await page.onLoad({ q: '陈老师' })
  page.openResult({ currentTarget: { dataset: { key: 'teacher:teacher-chen' } } })

  assert.equal(page.data.query, '陈老师')
  assert.equal(page.data.selectedType, 'course')
  assert.deepEqual(page.data.results.map(result => result.key), ['course:course-organic'])
  assert.equal(navigationCalls, 0)
})

test('course resource and guide navigation use stable public identifiers', async t => {
  const routes = []
  replaceMethod(t, navigation, 'openCourse', id => routes.push(['course', id]))
  replaceMethod(t, navigation, 'openCourseResources', id => routes.push(['resource', id]))
  replaceMethod(t, navigation, 'openGuide', id => routes.push(['guide', id]))
  const page = createPage({
    results: [
      buildSearchPresentation(item('course', 'course/id', '课程'), '课程'),
      buildSearchPresentation(item('resource', 'resource-id', '资料', { course_id: 'course/id' }), '资料'),
      buildSearchPresentation(item('guide', 'guide/id', '指南'), '指南')
    ]
  })

  for (const key of ['course:course/id', 'resource:resource-id', 'guide:guide/id']) {
    page.openResult({ currentTarget: { dataset: { key } } })
  }

  assert.deepEqual(routes, [
    ['course', 'course/id'],
    ['resource', 'course/id'],
    ['guide', 'guide/id']
  ])
})

test('resource and guide navigation helpers URL-encode stable identifiers', t => {
  const routes = []
  installWx(t, { navigateTo(options) { routes.push(options.url) } })

  navigation.openCourseResources('course/一 ?')
  navigation.openGuide('指南/一 ?')

  assert.deepEqual(routes, [
    '/pages/course-resources/index?id=course%2F%E4%B8%80%20%3F',
    '/pages/guide-detail/index?id=%E6%8C%87%E5%8D%97%2F%E4%B8%80%20%3F'
  ])
})

test('resource without course_id does not navigate and shows an honest safe message', t => {
  const toasts = []
  let navigations = 0
  installWx(t, { showToast(options) { toasts.push(options) } })
  replaceMethod(t, navigation, 'openCourseResources', () => { navigations += 1 })
  const missing = buildSearchPresentation(item('resource', 'orphan', '孤立资料'), '资料')
  const page = createPage({ results: [missing] })

  page.openResult({ currentTarget: { dataset: { key: missing.key } } })

  assert.equal(navigations, 0)
  assert.deepEqual(toasts, [{ title: '该资料缺少所属课程，暂时无法打开。', icon: 'none' }])
})

test('index network errors are sanitized and retry replaces the complete snapshot', async t => {
  let attempts = 0
  replaceMethod(t, publicApi, 'getSearchIndex', async () => {
    attempts += 1
    if (attempts === 1) {
      const error = new Error('request:fail https://private-provider.example/token=secret')
      error.code = 'NETWORK_ERROR'
      throw error
    }
    return indexSnapshot(chemistryItems)
  })
  replaceMethod(t, publicApi, 'getCourses', async () => courseResult([]))
  const page = createPage()

  await page.onLoad({ q: '化学' })
  assert.equal(page.data.error, '网络连接失败，请检查网络后重试。')
  assert.doesNotMatch(page.data.error, /https?:|provider|token|secret/i)

  await page.retry()
  assert.equal(page.data.indexReady, true)
  assert.equal(page.data.error, '')
  assert.equal(page.data.results.length > 0, true)
  assert.equal(attempts, 2)
})

test('an in-flight index response cannot update state after unload', async t => {
  const pending = deferred()
  replaceMethod(t, publicApi, 'getSearchIndex', () => pending.promise)
  replaceMethod(t, publicApi, 'getCourses', async () => courseResult([]))
  const page = createPage()

  const loading = page.onLoad({ q: '化学' })
  await flush()
  page.onUnload()
  const callsAtUnload = page._setDataCalls.length
  pending.resolve(indexSnapshot(chemistryItems))
  await loading

  assert.equal(page._setDataCalls.length, callsAtUnload)
  assert.equal(page.data.indexReady, false)
})

test('activating a facet forces course server mode and sends only formal parameters', async t => {
  let captured
  replaceMethod(t, publicApi, 'getCourses', async query => {
    captured = query
    return courseResult([course('filtered', { name: '有机化学' })], {
      facets: { groups: ['专业课'], terms: [], tags: ['化学'], assessments: [] }
    })
  })
  const page = createPage({
    query: '化学',
    tagChoices: ['不限', '化学'],
    tagOptions: ['化学'],
    indexReady: true
  })

  page.changeFacet({ currentTarget: { dataset: { key: 'tag' } }, detail: { value: '1' } })
  await flush()

  assert.equal(page.data.mode, 'facet')
  assert.equal(page.data.selectedType, 'course')
  assert.deepEqual(captured, {
    page: 1,
    page_size: 20,
    q: '化学',
    term: '',
    group: '',
    tag: '化学',
    assessment: ''
  })
  assert.deepEqual(page.data.results.map(result => result.key), ['course:filtered'])
})

test('clearing the final facet returns to four-type Fuse mode without another course request', t => {
  let calls = 0
  replaceMethod(t, publicApi, 'getCourses', async () => {
    calls += 1
    return courseResult([])
  })
  const page = createPage({
    query: '化学',
    mode: 'facet',
    tag: '化学',
    tagChoiceIndex: 1,
    hasActiveFilters: true,
    indexReady: true
  })
  page._searchEngine = createSearchEngine(chemistryItems)

  page.clearFilter({ currentTarget: { dataset: { key: 'tag' } } })

  assert.equal(page.data.mode, 'global')
  assert.equal(page.data.modeLabel, '四类搜索')
  assert.equal(page.data.hasActiveFilters, false)
  assert.equal(page.data.results.some(result => result.type !== 'course'), true)
  assert.equal(calls, 0)
})

test('course facet pagination preserves server order, deduplicates and reaches no-more state', async t => {
  const calls = []
  replaceMethod(t, publicApi, 'getCourses', async query => {
    calls.push(query)
    if (query.page === 1) return courseResult([course('a'), course('b')], { total: 3, page: 1, pageSize: 2 })
    return courseResult([course('b'), course('c')], { total: 3, page: 2, pageSize: 2 })
  })
  const page = createPage({
    query: '课程',
    mode: 'facet',
    tag: '数学',
    hasActiveFilters: true,
    pageSize: 2
  })

  await page.loadCourses()
  await page.loadCourses({ append: true })

  assert.deepEqual(calls.map(call => call.page), [1, 2])
  assert.deepEqual(page.data.results.map(result => result.id), ['a', 'b', 'c'])
  assert.equal(page.data.hasMore, false)
})

test('latest facet request wins and an older response cannot overwrite it', async t => {
  const pending = [deferred(), deferred()]
  let callIndex = 0
  replaceMethod(t, publicApi, 'getCourses', () => pending[callIndex++].promise)
  const page = createPage({ query: '旧搜索', mode: 'facet', tag: '数学', hasActiveFilters: true })

  const oldSearch = page.loadCourses()
  page.setData({ query: '新搜索' })
  const latestSearch = page.loadCourses()
  pending[1].resolve(courseResult([course('latest')]))
  await latestSearch
  pending[0].resolve(courseResult([course('stale')]))
  await oldSearch

  assert.deepEqual(page.data.results.map(result => result.id), ['latest'])
})

test('facet response cannot call setData after page unload', async t => {
  const pending = deferred()
  replaceMethod(t, publicApi, 'getCourses', () => pending.promise)
  const page = createPage({ query: '课程', mode: 'facet', tag: '数学', hasActiveFilters: true })

  const request = page.loadCourses()
  page.onUnload()
  const callsAtUnload = page._setDataCalls.length
  pending.resolve(courseResult([course('late')]))
  await request

  assert.equal(page._setDataCalls.length, callsAtUnload)
})

test('chemistry recall covers names tags resource course context stable order and type filtering', () => {
  const engine = createSearchEngine(chemistryItems)
  const first = engine.search('化学', { limit: Number.MAX_SAFE_INTEGER })
  const second = engine.search('化学', { limit: Number.MAX_SAFE_INTEGER })
  const keys = first.results.map(result => `${result.type}:${result.id}`)

  assert.deepEqual(second.results.map(result => `${result.type}:${result.id}`), keys)
  assert.equal(keys.includes('course:course-organic'), true)
  assert.equal(keys.includes('course:course-environmental'), true)
  assert.equal(keys.includes('resource:resource-paper'), true)
  assert.equal(keys.includes('course:course-unrelated'), false)
  assert.deepEqual(
    engine.search('化学', { type: 'resource' }).results.map(result => result.id),
    ['resource-paper']
  )
})

test('NFKC 80-character cap and token AND semantics remain in the page search path', async t => {
  const items = [
    item('course', 'data-structures', '数据结构', { short_name: 'DS', tags: ['算法'] }),
    item('course', 'data-science', '数据科学', { short_name: 'DS', tags: ['统计'] })
  ]
  replaceMethod(t, publicApi, 'getSearchIndex', async () => indexSnapshot(items))
  replaceMethod(t, publicApi, 'getCourses', async () => courseResult([]))
  const page = createPage()

  await page.onLoad({ q: 'ＤＳ，算法' })
  assert.deepEqual(page.data.results.map(result => result.id), ['data-structures'])

  page.input({ detail: { value: 'A'.repeat(100) } })
  assert.equal(page.data.query.length, 80)
  page.cancelSearchTimer()
})

test('highlighting locates plain text first and separately escapes every rendered segment', () => {
  const value = '<script>"CHEMISTRY" & \'course\'</script>'
  const highlighted = highlightText(value, 'chemistry')
  const presented = buildSearchPresentation(item('course', 'unsafe', value), 'chemistry')

  assert.equal(highlighted.matched, true)
  assert.match(highlighted.html, /^&lt;script&gt;&quot;<span [^>]+>CHEMISTRY<\/span>&quot; &amp; &#39;course&#39;&lt;\/script&gt;$/)
  assert.doesNotMatch(highlighted.html, /<script>|<\/script>/)
  assert.equal(presented.highlighted_name, highlighted.html)
  assert.match(presented.match_html, /^名称匹配：&lt;script&gt;/)
})

test('highlighting preserves continuous spans and marks each scattered name character once', () => {
  assert.equal(highlightText('有机化学', '有机化学').html, '<span style="color:#4B1F6F;background:#F8EFD9;font-weight:700">有机化学</span>')
  assert.equal(highlightText('高等数学', '高数').html, '<span style="color:#4B1F6F;background:#F8EFD9;font-weight:700">高</span>等<span style="color:#4B1F6F;background:#F8EFD9;font-weight:700">数</span>学')
  assert.equal(highlightText('有机化学', '有学').html, '<span style="color:#4B1F6F;background:#F8EFD9;font-weight:700">有</span>机化<span style="color:#4B1F6F;background:#F8EFD9;font-weight:700">学</span>')
  assert.equal(highlightText('有机化学', '机学').matched, true)
  assert.equal(highlightText('概率论与数理统计', '概统').matched, true)
  assert.equal(highlightText('高等数学', '数高').matched, false)
  assert.equal((highlightText('高等数学', '高 高').html.match(/>高<\/span>/g) || []).length, 1)
})

test('highlighting keeps NFKC semantics, escapes unsafe input and does not invent a match', () => {
  assert.equal(highlightText('Data Structures', 'ｄａｔａ').matched, true)
  assert.equal(highlightText('Data Structures', 'data structures').matched, true)
  const unsafe = highlightText('<高>&数', '高数')
  assert.match(unsafe.html, /&lt;<span [^>]+>高<\/span>&gt;&amp;<span [^>]+>数<\/span>/)
  assert.doesNotMatch(unsafe.html, /<script>|<高>/)
  assert.equal(highlightText('课程名称', '<script>').matched, false)
  assert.equal(buildSearchPresentation(item('course', 'plain', '完全不同'), '高数').highlighted_name, '完全不同')
})

test('type tabs stay in one visible horizontal scroller with an explicit discovery cue', () => {
  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/search/index.wxml'), 'utf8')
  const style = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/search/index.wxss'), 'utf8')

  assert.match(template, /class="type-tabs-hint">左右滑动/)
  assert.match(template, /class="type-tabs-edge"[^>]*>›<\/view>/)
  assert.match(template, /<scroll-view[^>]*class="type-tabs"[^>]*scroll-x[^>]*show-scrollbar="\{\{true\}\}"[^>]*>[\s\S]*<button[^>]*class="type-tab[^>]*hover-class="control--pressed"[^>]*wx:for="\{\{typeTabs\}\}"[^>]*data-type="\{\{item.type\}\}"[^>]*bindtap="changeType"/)
  assert.match(style, /\.type-tabs\s*\{[^}]*white-space:\s*nowrap/)
  assert.match(style, /\.type-tab\s*\{[^}]*display:\s*inline-flex;[^}]*width:\s*auto;[^}]*min-width:\s*150rpx;[^}]*min-height:\s*72rpx;[^}]*white-space:\s*nowrap/)
  assert.match(style, /\.type-tabs-edge\s*\{[^}]*linear-gradient\([^}]*pointer-events:\s*none/)
})

test('formal search runtime uses only adapter methods and keeps endpoint ownership static', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/search/index.js'), 'utf8')
  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/search/index.wxml'), 'utf8')

  assert.doesNotMatch(source, /wx\.request|utils\/request|['"`]\/search-index/)
  assert.match(source, /publicApi\.getSearchIndex\(\)/)
  assert.match(source, /publicApi\.getCourses\(query\)/)
  assert.match(source, /setTimeout\([^]*250\)/)
  assert.match(template, /maxlength="80"/)
  assert.match(template, /bindretry="retry"/)
  assert.match(template, /wx:key="key"/)
  assert.doesNotMatch(template, /当前仅开放课程搜索/)
})

test('home quick-grid removed, search compact', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/home/index.wxml'), 'utf8')
  assert.ok(!source.includes('quick-grid'), 'quick-grid should be removed')
  assert.ok(!source.includes('搜索课程、教师或关键词'), 'search placeholder should be short')
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
