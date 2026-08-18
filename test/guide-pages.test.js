const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const publicApi = require('../miniprogram/services/public-api')
const navigation = require('../miniprogram/utils/navigation')

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

function createPage(definition, data = {}) {
  const page = {
    ...definition,
    data: { ...JSON.parse(JSON.stringify(definition.data)), ...data },
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
    navigateTo() {},
    setNavigationBarTitle() {},
    showToast() {},
    ...implementation
  }
  t.after(() => {
    if (hadWx) global.wx = previousWx
    else delete global.wx
  })
}

function guide(id, overrides = {}) {
  return {
    id,
    title: `指南 ${id}`,
    summary: '公开摘要',
    category: 'add-drop',
    updated_at: '2026-08-16',
    applicable_scope: '本科生',
    related_course_ids: [],
    ...overrides
  }
}

function guideList(items, options = {}) {
  return {
    items,
    total: options.total == null ? items.length : options.total,
    page: options.page || 1,
    page_size: options.pageSize || 20,
    facets: { categories: options.categories || ['add-drop'] },
    data_updated_at: options.dataUpdatedAt || '2026-08-16T04:00:00.000Z'
  }
}

const guidesDefinition = capturePage('miniprogram/pages/guides/index.js')
const detailDefinition = capturePage('miniprogram/pages/guide-detail/index.js')

test('guide list exposes loading, true empty, safe error and retry recovery states', async t => {
  const pending = deferred()
  let attempts = 0
  replaceMethod(t, publicApi, 'getGuides', () => {
    attempts += 1
    if (attempts === 1) return pending.promise
    if (attempts === 2) {
      const error = new Error('provider https://private.example/token=secret')
      error.code = 'INTERNAL_ERROR'
      return Promise.reject(error)
    }
    return Promise.resolve(guideList([guide('recovered')]))
  })
  const page = createPage(guidesDefinition)

  const initialRequest = page.loadGuides()
  assert.equal(page.data.loading, true)
  assert.deepEqual(page.data.guides, [])
  pending.resolve(guideList([]))
  await initialRequest
  assert.equal(page.data.loading, false)
  assert.equal(page.data.error, '')
  assert.equal(page.data.isEmpty, true)
  assert.deepEqual(page.data.guides, [])

  await page.loadGuides()
  assert.equal(page.data.error, '暂时无法加载指南，请稍后重试。')
  assert.equal(page.data.isEmpty, false)
  assert.doesNotMatch(page.data.error, /provider|https?:|token/i)

  await page.retry()
  assert.deepEqual(page.data.guides.map(item => item.id), ['recovered'])
  assert.equal(page.data.error, '')

  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guides/index.wxml'), 'utf8')
  assert.match(template, /loading="\{\{loading\}\}"/)
  assert.match(template, /error="\{\{error\}\}"/)
  assert.match(template, /empty="\{\{isEmpty\}\}"/)
  assert.match(template, /bindretry="retry"/)
})

test('guide list keeps network failures, malformed empty pages and tab returns out of the true-empty state', async t => {
  const calls = []
  replaceMethod(t, publicApi, 'getGuides', query => {
    calls.push(query)
    if (calls.length === 1) {
      const error = new Error('https://private.example/?token=secret')
      error.code = 'NETWORK_ERROR'
      return Promise.reject(error)
    }
    if (calls.length === 2) return Promise.resolve(guideList([], { total: 2 }))
    return Promise.resolve(guideList([]))
  })
  const page = createPage(guidesDefinition)

  await page.loadGuides()
  assert.equal(page.data.loading, false)
  assert.equal(page.data.error, '网络连接失败，请检查网络后重试。')
  assert.equal(page.data.isEmpty, false)
  assert.doesNotMatch(page.data.error, /private|token|https?:/i)
  const callsBeforeErrorReturn = calls.length
  page.onHide()
  page.onShow()
  assert.equal(calls.length, callsBeforeErrorReturn)
  assert.equal(page.data.error, '网络连接失败，请检查网络后重试。')

  await page.retry()
  assert.equal(page.data.error, '暂时无法加载指南，请稍后重试。')
  assert.equal(page.data.isEmpty, false)

  await page.retry()
  assert.equal(page.data.error, '')
  assert.equal(page.data.isEmpty, true)
  const callsBeforeReturn = calls.length
  page.onHide()
  page.onShow()
  assert.equal(calls.length, callsBeforeReturn)
  assert.equal(page.data.isEmpty, true)
})

test('guide tab onShow preserves an in-flight and ready request without issuing another read', async t => {
  const pending = deferred()
  let calls = 0
  replaceMethod(t, publicApi, 'getGuides', () => {
    calls += 1
    return pending.promise
  })
  const page = createPage(guidesDefinition)

  const request = page.loadGuides()
  page.onShow()
  assert.equal(calls, 1)
  assert.equal(page.data.loading, true)
  pending.resolve(guideList([guide('ready')]))
  await request
  page.onHide()
  page.onShow()
  assert.equal(calls, 1)
  assert.deepEqual(page.data.guides.map(item => item.id), ['ready'])
})

test('guide pagination preserves server order, removes duplicate ids and uses server facets', async t => {
  const calls = []
  replaceMethod(t, publicApi, 'getGuides', async query => {
    calls.push(query)
    if (query.page === 1) {
      return guideList([guide('a'), guide('b')], {
        total: 3, page: 1, pageSize: 2, categories: ['course-selection', 'add-drop']
      })
    }
    return guideList([guide('b'), guide('c')], {
      total: 3, page: 2, pageSize: 2, categories: ['course-selection', 'add-drop']
    })
  })
  const page = createPage(guidesDefinition, { pageSize: 2 })

  await page.loadGuides()
  assert.deepEqual(page.data.guides.map(item => item.id), ['a', 'b'])
  assert.equal(page.data.hasMore, true)
  assert.equal(page.data.categories.find(item => item.value === 'add-drop').unavailable, false)
  assert.equal(page.data.categories.find(item => item.value === 'exam-grade').unavailable, true)

  await page.loadGuides({ append: true })
  assert.deepEqual(calls.map(call => call.page), [1, 2])
  assert.deepEqual(page.data.guides.map(item => item.id), ['a', 'b', 'c'])
  assert.equal(page.data.hasMore, false)
  assert.equal(page.data.loadingMore, false)
})

test('guide list navigation URL-encodes the stable id', t => {
  const routes = []
  installWx(t, { navigateTo(options) { routes.push(options.url) } })
  const page = createPage(guidesDefinition)

  page.openGuide({ currentTarget: { dataset: { id: '指南/一 ?' } } })

  assert.deepEqual(routes, ['/pages/guide-detail/index?id=%E6%8C%87%E5%8D%97%2F%E4%B8%80%20%3F'])
})

test('guide list owns a full-width native button layout', () => {
  const styles = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guides/index.wxss'), 'utf8')
  assert.match(styles, /\.guide-list\s*\{[^}]*width:\s*100%/s)
  assert.match(styles, /\.guide-row\s*\{[^}]*width:\s*100%\s*!important/s)
  assert.match(styles, /\.guide-row\s*\{[^}]*min-width:\s*100%/s)
  assert.match(styles, /\.guide-row\s*\{[^}]*max-width:\s*100%/s)
  assert.match(styles, /\.guide-row\s*\{[^}]*margin:\s*0\s*!important/s)
})

test('rapid guide category changes are latest-request-wins and stale errors stay silent', async t => {
  const pending = [deferred(), deferred()]
  const calls = []
  replaceMethod(t, publicApi, 'getGuides', query => {
    calls.push(query)
    return pending[calls.length - 1].promise
  })
  const page = createPage(guidesDefinition)

  const oldRequest = page.loadGuides()
  page.setData({ category: 'exam-grade' })
  const latestRequest = page.loadGuides()
  pending[1].resolve(guideList([guide('latest', { category: 'exam-grade' })]))
  await latestRequest
  pending[0].reject(new Error('old provider diagnostic'))
  await oldRequest

  assert.deepEqual(calls.map(call => call.category), ['', 'exam-grade'])
  assert.deepEqual(page.data.guides.map(item => item.id), ['latest'])
  assert.equal(page.data.error, '')
})

test('guide category retries only the selected category and never shows its previous list', async t => {
  const calls = []
  replaceMethod(t, publicApi, 'getGuides', async query => {
    calls.push(query)
    if (query.category === 'exam-grade' && calls.filter(item => item.category === 'exam-grade').length === 1) {
      const error = new Error('old category diagnostic')
      error.code = 'NETWORK_ERROR'
      throw error
    }
    return guideList([guide(query.category || 'all', { category: query.category || 'add-drop' })])
  })
  const page = createPage(guidesDefinition)

  await page.loadGuides()
  assert.deepEqual(page.data.guides.map(item => item.id), ['all'])
  await page.chooseCategory({ currentTarget: { dataset: { category: 'exam-grade' } } })
  assert.equal(page.data.category, 'exam-grade')
  assert.deepEqual(page.data.guides, [])
  assert.equal(page.data.error, '网络连接失败，请检查网络后重试。')

  await page.retry()
  assert.deepEqual(page.data.guides.map(item => item.id), ['exam-grade'])
  assert.deepEqual(calls.map(item => item.category), ['', 'exam-grade', 'exam-grade'])
})

test('guide load-more failure preserves items and retries the same next page', async t => {
  const calls = []
  replaceMethod(t, publicApi, 'getGuides', async query => {
    calls.push(query)
    if (query.page === 1) return guideList([guide('first')], { total: 2, page: 1, pageSize: 1 })
    if (calls.filter(item => item.page === 2).length === 1) throw new Error('provider private retry detail')
    return guideList([guide('second')], { total: 2, page: 2, pageSize: 1 })
  })
  const page = createPage(guidesDefinition, { pageSize: 1 })

  await page.loadGuides()
  await page.loadGuides({ append: true })
  assert.deepEqual(page.data.guides.map(item => item.id), ['first'])
  assert.equal(page.data.error, '')
  assert.equal(page.data.loadMoreError, '加载更多失败，请重试。')

  await page.retryLoadMore()
  assert.deepEqual(calls.map(item => item.page), [1, 2, 2])
  assert.deepEqual(page.data.guides.map(item => item.id), ['first', 'second'])
  assert.equal(page.data.loadMoreError, '')
})

test('an in-flight guide list response cannot call setData after unload', async t => {
  const pending = deferred()
  replaceMethod(t, publicApi, 'getGuides', () => pending.promise)
  const page = createPage(guidesDefinition)

  const request = page.loadGuides()
  page.onUnload()
  const callsAtUnload = page._setDataCalls.length
  pending.resolve(guideList([guide('late')]))
  await request

  assert.equal(page._setDataCalls.length, callsAtUnload)
  assert.deepEqual(page.data.guides, [])
})

test('guide detail rejects an invalid id without requesting and loads public detail fields', async t => {
  let requests = 0
  replaceMethod(t, publicApi, 'getGuide', async id => {
    requests += 1
    if (id === 'guide-without-optional-fields') {
      return {
        ...guide(id, { summary: '', applicable_scope: '' }),
        steps: [], related_courses: [], source_title: '', source_url: '', correction_url: ''
      }
    }
    return {
      ...guide(id),
      steps: [{ title: '第一步', body: '查看通知' }],
      related_courses: [{ id: 'course-id', name: '有机化学' }],
      source_title: '教务处通知',
      source_url: 'https://jwc.nankai.edu.cn/notice',
      correction_url: 'https://nkustudy.top/feedback?guide=guide-id'
    }
  })
  const titles = []
  installWx(t, { setNavigationBarTitle(options) { titles.push(options.title) } })
  const invalidPage = createPage(detailDefinition)
  await invalidPage.onLoad({ id: '   ' })
  assert.equal(requests, 0)
  assert.equal(invalidPage.data.error, '指南编号无效，请返回列表后重试。')

  const page = createPage(detailDefinition)
  await page.onLoad({ id: 'guide-id' })
  assert.equal(requests, 1)
  assert.equal(page.data.guide.title, '指南 guide-id')
  assert.equal(page.data.guide.category_label, '退补选')
  assert.deepEqual(page.data.guide.steps, [{ title: '第一步', body: '查看通知' }])
  assert.deepEqual(page.data.guide.related_courses, [{ id: 'course-id', name: '有机化学' }])
  assert.deepEqual(titles, ['指南 guide-id'])

  const optionalPage = createPage(detailDefinition)
  await optionalPage.onLoad({ id: 'guide-without-optional-fields' })
  assert.equal(optionalPage.data.guide.id, 'guide-without-optional-fields')
  assert.equal(optionalPage.data.guide.applicable_scope_label, '未注明')

  const opened = []
  replaceMethod(t, navigation, 'openCourse', id => opened.push(id))
  page.openRelatedCourse({ currentTarget: { dataset: { id: 'course-id' } } })
  assert.deepEqual(opened, ['course-id'])
})

test('an in-flight guide detail response cannot call setData after unload', async t => {
  const pending = deferred()
  replaceMethod(t, publicApi, 'getGuide', () => pending.promise)
  installWx(t)
  const page = createPage(detailDefinition, { id: 'guide-id' })

  const request = page.loadGuide()
  page.onUnload()
  const callsAtUnload = page._setDataCalls.length
  pending.resolve({
    ...guide('guide-id'), steps: [], related_courses: [], source_title: '', source_url: '', correction_url: ''
  })
  await request

  assert.equal(page._setDataCalls.length, callsAtUnload)
  assert.equal(page.data.guide, null)
})

test('guide detail distinguishes not-found from network failure and retry recovers the stable id', async t => {
  let attempts = 0
  replaceMethod(t, publicApi, 'getGuide', async id => {
    attempts += 1
    if (attempts === 1) {
      const error = new Error('provider https://private.example/token')
      error.code = 'NETWORK_ERROR'
      throw error
    }
    if (attempts === 2) {
      const error = new Error('missing')
      error.statusCode = 404
      error.code = 'GUIDE_NOT_FOUND'
      throw error
    }
    return { ...guide(id), steps: [], related_courses: [], source_title: '', source_url: '', correction_url: '' }
  })
  installWx(t)
  const page = createPage(detailDefinition)

  await page.onLoad({ id: 'stable-guide-id' })
  assert.equal(page.data.error, '网络连接失败，请检查网络后重试。')
  assert.equal(page.data.unavailable, false)
  assert.doesNotMatch(page.data.error, /private|provider|token|https?:/i)

  await page.retry()
  assert.equal(page.data.error, '')
  assert.equal(page.data.unavailable, true)

  await page.retry()
  assert.equal(page.data.unavailable, false)
  assert.equal(page.data.guide.id, 'stable-guide-id')
  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-detail/index.wxml'), 'utf8')
  assert.match(template, /empty="\{\{unavailable\}\}"/)
})

test('source and correction copies never request the network and failures stay recoverable', async t => {
  const copied = []
  const toasts = []
  let networkRequests = 0
  installWx(t, {
    request() { networkRequests += 1 },
    setClipboardData(options) {
      copied.push(options.data)
      if (copied.length === 1) options.success()
      else options.fail({ errMsg: 'provider internal clipboard failure' })
    },
    showToast(options) { toasts.push(options) }
  })
  const page = createPage(detailDefinition, {
    guide: {
      source_url: 'https://jwc.nankai.edu.cn/notice',
      correction_url: 'https://nkustudy.top/feedback?guide=guide-id'
    }
  })

  assert.equal(await page.copySourceUrl(), true)
  assert.equal(await page.copyCorrectionUrl(), false)
  assert.equal(networkRequests, 0)
  assert.deepEqual(copied, [
    'https://jwc.nankai.edu.cn/notice',
    'https://nkustudy.top/feedback?guide=guide-id'
  ])
  assert.deepEqual(toasts.map(item => item.title), ['来源链接已复制', '复制失败，请稍后重试。'])
  assert.doesNotMatch(toasts.map(item => item.title).join(' '), /provider|clipboard failure/i)

  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-detail/index.wxml'), 'utf8')
  for (const field of ['title', 'summary', 'category_label', 'updated_label', 'applicable_scope_label', 'steps', 'related_courses', 'source_title']) {
    assert.match(template, new RegExp(`guide\\.${field}`))
  }
  assert.match(template, /wx:if="\{\{guide\.source_url\}\}" bindtap="copySourceUrl"/)
  assert.match(template, /wx:if="\{\{guide\.correction_url\}\}"/)
})
