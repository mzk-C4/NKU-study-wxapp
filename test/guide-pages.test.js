const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const publicApi = require('../miniprogram/features/learning-compass/api')
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
    getWindowInfo() { return { statusBarHeight: 22 } },
    navigateTo() {},
    navigateBack() {},
    switchTab() {},
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
const categoryDefinition = capturePage('miniprogram/pages/guide-category/index.js')
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
        total: 3, page: 1, pageSize: 2, categories: ['选课与修读', '考试与成绩']
      })
    }
    return guideList([guide('b'), guide('c')], {
      total: 3, page: 2, pageSize: 2, categories: ['选课与修读', '考试与成绩']
    })
  })
  const page = createPage(guidesDefinition, { pageSize: 2 })

  await page.loadGuides()
  assert.deepEqual(page.data.guides.map(item => item.id), ['a', 'b'])
  assert.equal(page.data.hasMore, true)
  assert.equal(page.data.categories.find(item => item.value === '考试与成绩').unavailable, false)
  assert.equal(page.data.categories.find(item => item.value === '规范与权益').unavailable, true)

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

test('category guide page renders one five-category result set and opens stable guide ids', async t => {
  const calls = []
  const routes = []
  replaceMethod(t, publicApi, 'getGuides', async query => {
    calls.push(query)
    return guideList([
      guide('exam-attendance-and-exceptions', {
        title: '参加考试或无法按时考试时怎么办？',
        category: '考试与成绩',
        summary: '不应显示的旧摘要'
      }),
      guide('course-grade-and-gpa', {
        title: '课程总评成绩和GPA如何计算？',
        category: '考试与成绩',
        summary: '不应显示的旧摘要'
      }),
      guide('grade-review', {
        title: '对课程成绩有异议，如何申请复核？',
        category: '考试与成绩',
        summary: '不应显示的旧摘要'
      })
    ], { total: 3, categories: ['考试与成绩'] })
  })
  replaceMethod(t, navigation, 'openGuide', id => routes.push(id))
  installWx(t)
  const page = createPage(categoryDefinition)

  await page.onLoad({ category: encodeURIComponent('考试与成绩') })
  assert.deepEqual(calls, [{ category: '考试与成绩', page: 1, page_size: 20 }])
  assert.equal(page.data.header.title, '考试与成绩')
  assert.equal(page.data.header.countLabel, '共 3 篇已发布指南')
  assert.deepEqual(page.data.guides.map(item => item.title), [
    '参加考试或无法按时考试时怎么办？',
    '课程总评成绩和GPA如何计算？',
    '对课程成绩有异议，如何申请复核？'
  ])
  assert.equal(page.data.guides[0].preview, '不应显示的旧摘要')
  assert.doesNotMatch(fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-category/index.js'), 'utf8'), /SAMPLE_PRESENTATION/)

  page.openGuide({ currentTarget: { dataset: { id: 'guide/一 ?' } } })
  assert.deepEqual(routes, ['guide/一 ?'])

  const app = JSON.parse(fs.readFileSync(path.join(projectRoot, 'miniprogram/app.json'), 'utf8'))
  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-category/index.wxml'), 'utf8')
  const styles = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-category/index.wxss'), 'utf8')
  assert.ok(app.pages.includes('pages/guide-category/index'))
  assert.match(template, /\{\{header\.countLabel\}\}/)
  assert.match(template, /返回学习指南针/)
  assert.match(template, /category-guide-card/)
  assert.doesNotMatch(template, /scroll-x/)
  assert.match(styles, /\.category-guide-card\s*\{[^}]*width:\s*100%\s*!important/s)
  assert.match(styles, /\.category-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/s)
})

test('category guide page keeps the all-guides route unfiltered', async t => {
  const calls = []
  replaceMethod(t, publicApi, 'getGuides', async query => {
    calls.push(query)
    return guideList([
      guide('grade-review', { category: '考试与成绩' }),
      guide('ai-coursework', { category: '规范与权益' })
    ], { total: 2, categories: ['考试与成绩', '规范与权益'] })
  })
  installWx(t)
  const page = createPage(categoryDefinition)

  await page.onLoad({ category: '' })
  assert.deepEqual(calls, [{ category: '', page: 1, page_size: 20 }])
  assert.equal(page.data.header.title, '全部指南')
  assert.deepEqual(page.data.guides.map(item => item.id), ['grade-review', 'ai-coursework'])
})

test('guide list owns a full-width native button layout', () => {
  const styles = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guides/index.wxss'), 'utf8')
  assert.match(styles, /\.guide-list\s*\{[^}]*width:\s*100%/s)
  assert.match(styles, /\.guide-row\s*\{[^}]*width:\s*100%\s*!important/s)
  assert.match(styles, /\.guide-row\s*\{[^}]*min-width:\s*100%/s)
  assert.match(styles, /\.guide-row\s*\{[^}]*max-width:\s*100%/s)
  assert.match(styles, /\.guide-row\s*\{[^}]*margin:\s*0\s*!important/s)
})

test('guide home implements the approved Learning Compass visual contract', () => {
  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guides/index.wxml'), 'utf8')
  const styles = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guides/index.wxss'), 'utf8')
  const config = JSON.parse(fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guides/index.json'), 'utf8'))

  assert.equal(config.navigationBarTitleText, '学习指南针')
  assert.match(template, /src="\/assets\/brand\.png"/)
  assert.match(template, />学习指南针</)
  assert.match(template, /搜索选课、成绩、学籍、AI规范等问题/)
  assert.match(template, /问问学习指南针/)
  assert.match(template, /基于已审核的学校文件回答，并附原文来源/)
  assert.match(template, /近期更新/)
  assert.doesNotMatch(template, />培养方案</)
  assert.deepEqual(guidesDefinition.data.homeCategories.map(item => item.label), [
    '选课与修读', '考试与成绩', '学籍与毕业', '学业拓展', '规范与权益'
  ])
  assert.match(styles, /\.guide-search\s*\{[^}]*width:\s*100%\s*!important/s)
  assert.match(styles, /\.assistant-action\s*\{[^}]*width:\s*150rpx\s*!important/s)
  assert.match(styles, /\.category-panel\s*\{[^}]*display:\s*flex/s)
  assert.match(styles, /\.home-category\s*\{[^}]*width:\s*20%\s*!important/s)
  assert.match(styles, /\.home-category\s*\{[^}]*max-width:\s*20%/s)
  assert.match(styles, /\.view-all\s*\{[^}]*margin:\s*0\s+0\s+0\s+auto\s*!important/s)
  assert.match(styles, /\.guide-intro\s*\{[^}]*linear-gradient/s)
  assert.match(styles, /\.assistant-card\s*\{[^}]*border-radius/s)
})

test('guide home search, category and AI controls have honest recoverable behavior', t => {
  const routes = []
  const categories = []
  installWx(t, {
    navigateTo(options) { routes.push(options.url) },
    getNetworkType() { assert.fail('guide AI entry must not probe network') }
  })
  replaceMethod(t, navigation, 'openGuideCategory', category => categories.push(category))
  const page = createPage(guidesDefinition)

  page.openSearch()
  page.openHomeCategory({ currentTarget: { dataset: { value: '考试与成绩' } } })
  page.openAllGuides()
  page.openAssistant()

  assert.equal(page.data.activeHomeCategory, '考试与成绩')
  assert.deepEqual(routes, ['/pages/search/index?q=', '/pages/guide-assistant/index'])
  assert.deepEqual(categories, ['考试与成绩', ''])
  assert.equal(page.data.guideContextLabel, '年级未设置 · 专业未设置')
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
  assert.equal(page.data.guide.category, 'add-drop')
  assert.deepEqual(page.data.guide.sections.map(item => ({ title: item.title, body: item.body })), [{ title: '第一步', body: '查看通知' }])
  assert.deepEqual(page.data.guide.related_courses, [{ id: 'course-id', name: '有机化学' }])
  assert.deepEqual(titles, ['指南 guide-id'])

  const optionalPage = createPage(detailDefinition)
  await optionalPage.onLoad({ id: 'guide-without-optional-fields' })
  assert.equal(optionalPage.data.guide.id, 'guide-without-optional-fields')
  assert.equal(optionalPage.data.guide.scope, '适用范围以相关学校文件为准')

  const opened = []
  replaceMethod(t, navigation, 'openCourse', id => opened.push(id))
  page.openRelatedCourse({ currentTarget: { dataset: { id: 'course-id' } } })
  assert.deepEqual(opened, ['course-id'])
})

test('transfer-major detail keeps university rules and the selected college requirements separate', async t => {
  const variantCalls = []
  replaceMethod(t, publicApi, 'getGuide', async () => ({
    id: 'transfer-major-2026',
    title: '2026年本科生转专业申请与学院差异',
    category: '学业拓展',
    content_type: 'multi_variant',
    sections: [{ id: 'university', title: '校级转专业规则', body: '本办法适用于具有我校学籍的全日制本科学生。' }],
    sources: [{ id: 'SRC-001', title: '南开大学本科学生手册（2025上册）', file_type: 'pdf', file_name: '学生手册.pdf', file_url: 'https://resources.nkustudy.top/guide-sources/handbook.pdf' }],
    variants: [
      { id: 'materials-science', title: '材料科学与工程学院', order: 1, source_count: 1 },
      { id: 'chemistry', title: '化学学院', order: 6, source_count: 1 }
    ]
  }))
  replaceMethod(t, publicApi, 'getGuideVariant', async (guideId, variantId) => {
    variantCalls.push({ guideId, variantId })
    const materials = variantId === 'materials-science'
    return {
      guide_id: guideId,
      variant: {
        id: variantId,
        title: materials ? '材料科学与工程学院' : '化学学院',
        sections: [{
          id: `${variantId}-requirements`,
          title: materials ? '三、转入基本申请条件' : '三、其他学院学生转入细则',
          body: materials ? '一年级本科生申请转入材料学院的学生，原专业不做要求。\n笔试和面试成绩比例为6:4。' : '化学学院具体要求原文。'
        }],
        sources: [{
          id: materials ? 'SRC-005-materials-science' : 'SRC-005-chemistry',
          title: materials ? '材料科学与工程学院本科学生转专业细则' : '化学学院2026年本科学生转专业细则及接收计划',
          file_type: 'docx',
          file_name: materials ? '材料科学与工程学院本科学生转专业细则.docx' : '化学学院2026年本科学生转专业细则及接收计划.docx',
          file_url: `https://resources.nkustudy.top/guide-sources/${variantId}.docx`
        }]
      }
    }
  })
  installWx(t)
  const page = createPage(detailDefinition)

  await page.onLoad({ id: 'transfer-major-2026' })
  assert.equal(page.data.guide.transfer.selectedName, '材料科学与工程学院')
  assert.deepEqual(variantCalls, [{ guideId: 'transfer-major-2026', variantId: 'materials-science' }])
  assert.match(page.data.guide.transfer.panels[0].body, /一年级本科生申请转入材料学院/)

  await page.chooseTransferCollege({ detail: { value: '1' } })
  assert.equal(page.data.guide.transfer.selectedName, '化学学院')
  assert.equal(page.data.guide.transfer.selectedSourceName, '化学学院2026年本科学生转专业细则及接收计划.docx')
  assert.match(page.data.guide.transfer.panels[0].body, /化学学院具体要求原文/)
  assert.deepEqual(variantCalls.map(item => item.variantId), ['materials-science', 'chemistry'])
  assert.doesNotMatch(fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-detail/index.js'), 'utf8'), /GUIDE_META|MATERIAL_TRANSFER_PANELS/)

  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-detail/index.wxml'), 'utf8')
  const styles = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-detail/index.wxss'), 'utf8')
  assert.match(template, /选择目标学院/)
  assert.match(template, /学校层面统一规定/)
  assert.match(template, /具体要求/)
  assert.match(template, /mode="selector"/)
  assert.match(styles, /\.transfer-picker-content\s*\{[^}]*grid-template-columns/s)
  assert.match(styles, /\.transfer-rule-topics\s*\{[^}]*grid-template-columns:\s*repeat\(4/s)
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

test('PDF and DOCX sources download and open while correction copy failures stay recoverable', async t => {
  const copied = []
  const downloads = []
  const opened = []
  const toasts = []
  installWx(t, {
    downloadFile(options) {
      downloads.push(options.url)
      options.success({ statusCode: 200, tempFilePath: `/tmp/source-${downloads.length}` })
    },
    openDocument(options) {
      opened.push({ filePath: options.filePath, fileType: options.fileType, showMenu: options.showMenu })
      options.success()
    },
    setClipboardData(options) {
      copied.push(options.data)
      options.fail({ errMsg: 'provider internal clipboard failure' })
    },
    showToast(options) { toasts.push(options) }
  })
  const page = createPage(detailDefinition, {
    guide: {
      source: { fileUrl: 'https://resources.nkustudy.top/guide-sources/rules.pdf', fileType: 'PDF' },
      correction_url: 'https://nkustudy.top/feedback?guide=guide-id'
    }
  })

  assert.equal(await page.copySourceUrl(), true)
  page.data.guide.source = { fileUrl: 'https://resources.nkustudy.top/guide-sources/rules.docx', fileType: 'DOCX' }
  assert.equal(await page.copySourceUrl(), true)
  assert.equal(await page.copyCorrectionUrl(), false)
  assert.deepEqual(downloads, [
    'https://resources.nkustudy.top/guide-sources/rules.pdf',
    'https://resources.nkustudy.top/guide-sources/rules.docx'
  ])
  assert.deepEqual(opened.map(item => item.fileType), ['pdf', 'docx'])
  assert.equal(opened.every(item => item.showMenu === true), true)
  assert.deepEqual(copied, ['https://nkustudy.top/feedback?guide=guide-id'])
  assert.deepEqual(toasts.map(item => item.title), ['复制失败，请稍后重试。'])
  assert.doesNotMatch(toasts.map(item => item.title).join(' '), /provider|clipboard failure/i)

  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-detail/index.wxml'), 'utf8')
  for (const field of ['title', 'category', 'scope', 'sections', 'source.title', 'source.number']) {
    assert.match(template, new RegExp(`guide\\.${field.replace('.', '\\.')}`))
  }
  assert.match(template, /查看完整原文件/)
  assert.match(template, /bindtap="copySourceUrl"/)
  assert.match(template, /bindtap="copyCorrectionUrl"/)
})
