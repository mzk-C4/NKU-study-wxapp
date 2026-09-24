const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const publicApi = require('../miniprogram/features/learning-compass/api')
const navigation = require('../miniprogram/utils/navigation')
const feedbackApi = require('../miniprogram/utils/feedback-api')

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
const searchDefinition = capturePage('miniprogram/pages/guide-search/index.js')
const documentsDefinition = capturePage('miniprogram/pages/guide-documents/index.js')
const catalog = require('../miniprogram/features/learning-compass/catalog')
const detailDefinition = capturePage('miniprogram/pages/guide-detail/index.js')

test('guide list exposes loading, true empty, safe error and retry recovery states', async t => {
  let attempts = 0
  replaceMethod(t, publicApi, 'getGuides', async () => {
    if (++attempts === 1) return guideList([])
    if (attempts === 2) throw Error('token=private provider')
    return guideList([guide('recovered')])
  })
  const page = createPage(searchDefinition, { kind: 'guide' })
  await page.loadGuides()
  assert.equal(page.data.loading, false); assert.equal(page.data.isEmpty, true)
  await page.loadGuides()
  assert.match(page.data.warning, /加载失败/)
  assert.doesNotMatch(page.data.warning, /provider|token/)
  await page.retry()
  assert.equal(page.data.warning, '')
  assert.deepEqual(page.data.results.map(x => x.id), ['recovered'])
  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/features/learning-compass/catalog.wxml'), 'utf8')
  for (const binding of ['loading="{{loading}}"', 'empty="{{isEmpty}}"', 'bindretry="retry"']) assert.ok(template.includes(binding))
})

test('guide list keeps network failures, malformed empty pages and tab returns out of the true-empty state', async t => {
  let attempts = 0
  replaceMethod(t, publicApi, 'getGuides', async () => {
    if (++attempts === 1) throw Object.assign(Error('private'), {code:'NETWORK_ERROR'})
    return guideList([], {total: 3})
  })
  const page = createPage(searchDefinition)
  await page.loadGuides()
  assert.equal(page.data.isEmpty, false); assert.match(page.data.warning, /仅显示/)
  await page.retry()
  assert.match(page.data.warning, /加载失败/); assert.equal(page.data.isEmpty, false)
  assert.ok(page.data.results.every(item => item.kind === 'pdf'))
})

test('guide home tab returns preserve four entries without issuing catalog requests', async t => {
  installWx(t)
  let calls = 0
  replaceMethod(t, publicApi, 'getGuides', () => { calls++; return Promise.resolve(guideList([])) })
  const page = createPage(guidesDefinition)
  page.onLoad(); page.onShow(); page.onShow()
  assert.equal(calls, 0)
  assert.deepEqual(page.data.homeCategories.map(x => x.label), ['新生入学','学海无涯','在校生活','学长焚决'])
})

test('catalog pagination preserves server order, removes duplicates and uses only compatible API parameters', async t => {
  const calls = []
  replaceMethod(t, publicApi, 'getGuides', async q => {
    calls.push(q)
    return q.page === 1 ? guideList([guide('a'),guide('b')], {total:3})
      : guideList([guide('b'),guide('c')], {total:3,page:2})
  })
  const page = createPage(searchDefinition, {kind:'guide'})
  await page.loadGuides()
  assert.deepEqual(page.data.results.map(x=>x.id), ['a','b','c'])
  assert.deepEqual(calls, [{page:1,page_size:100},{page:2,page_size:100}])
  assert.equal(page.data.total, 3)
})

test('guide list navigation URL-encodes the stable id', async t => {
  const routes=[]
  installWx(t, {navigateTo(o){routes.push(o.url)}})
  replaceMethod(t, publicApi, 'getGuides', async()=>guideList([guide('guide/一 ?')]))
  const page=createPage(searchDefinition)
  await page.loadGuides()
  await page.openItem({currentTarget:{dataset:{key:'guide:guide/一 ?'}}})
  assert.deepEqual(routes, ['/pages/guide-detail/index?id='+encodeURIComponent('guide/一 ?')])
})

test('category guide page maps legacy categories to four topics and filters locally', async t => {
  const calls=[]
  replaceMethod(t, publicApi, 'getGuides', async q=>{
    calls.push(q)
    return guideList([guide('a',{title:'成绩复核',category:'考试与成绩'}),guide('b',{title:'学生权益',category:'规范与权益'})])
  })
  installWx(t)
  const page=createPage(categoryDefinition)
  await page.onLoad({category:encodeURIComponent('考试与成绩')})
  assert.equal(page.data.topic,'study')
  assert.equal(page.data.title,'学海无涯')
  assert.deepEqual(page.data.results.filter(x=>x.kind==='guide').map(x=>x.id),['a'])
  page.chooseCategory({currentTarget:{dataset:{category:'life'}}})
  assert.deepEqual(page.data.results.filter(x=>x.kind==='guide').map(x=>x.id),['b'])
  assert.equal(calls.length,1)
  assert.equal(page.data.topics.length,4)
})

test('category guide page keeps the all-guides route unfiltered', async t => {
  const calls=[]
  replaceMethod(t, publicApi, 'getGuides',async q=>{calls.push(q);return guideList([guide('a'),guide('b',{category:'规范与权益'})])})
  installWx(t)
  const page=createPage(categoryDefinition)
  await page.onLoad({category:''})
  assert.equal(page.data.topic,''); assert.equal(page.data.title,'全部指南')
  assert.deepEqual(page.data.results.filter(x=>x.kind==='guide').map(x=>x.id),['a','b'])
  assert.deepEqual(calls,[{page:1,page_size:100}])
})

test('guide list owns a full-width native button layout', async t => {
  const styles=fs.readFileSync(path.join(projectRoot,'miniprogram/features/learning-compass/catalog.wxss'),'utf8')
  assert.match(styles, /\.catalog-row\s*\{[^}]*width:\s*100%\s*!important/s)
  assert.match(styles, /\.catalog-row\s*\{[^}]*margin:\s*0\s+0\s+18rpx\s*!important/s)
  assert.match(styles, /\.catalog-main\s*\{[^}]*min-width:\s*0/s)
})

test('guide home implements the approved Learning Compass visual contract', async t => {
  const template=fs.readFileSync(path.join(projectRoot,'miniprogram/pages/guides/index.wxml'),'utf8')
  const styles=fs.readFileSync(path.join(projectRoot,'miniprogram/pages/guides/index.wxss'),'utf8')
  assert.match(template,/src="\/assets\/brand\.png"/)
  assert.match(template,/学习和生活指南针/)
  assert.match(template,/PDF 学生资料/)
  assert.match(template,/bindtap="openDocuments"/)
  assert.doesNotMatch(template,/近期更新|wx:for="{{pdfDocuments}}"/)
  assert.match(styles,/\.home-category\s*\{[^}]*width:\s*25%\s*!important/s)
  assert.deepEqual(guidesDefinition.data.homeCategories.map(x=>x.label),['新生入学','学海无涯','在校生活','学长焚决'])
  assert.equal(guidesDefinition.data.pdfCount,7)
})

test('guide PDF cards download and open only the selected trusted document', async t => {
  const downloads=[],opened=[]
  installWx(t,{downloadFile(o){downloads.push(o.url);o.success({statusCode:200,tempFilePath:'/tmp/guide.pdf'})},
    openDocument(o){opened.push(o.fileType);o.success()}})
  replaceMethod(t,publicApi,'getGuides',()=>assert.fail('PDF directory must work offline'))
  const page=createPage(documentsDefinition)
  await page.onLoad()
  assert.equal(await page.openItem({currentTarget:{dataset:{key:'pdf:nku-postgraduate-entrance-exam-roadmap'}}}),true)
  assert.deepEqual(downloads,['https://resources.nkustudy.top/guide-sources/nku-postgraduate-entrance-exam-roadmap.pdf'])
  assert.deepEqual(opened,['pdf']); assert.equal(page.data.openingDocumentId,'')
  assert.equal(await page.openItem({currentTarget:{dataset:{key:'unknown'}}}),false)
})

test('guide home search, category and AI controls have honest recoverable behavior', async t => {
  const routes=[]
  installWx(t,{navigateTo(o){routes.push(o.url)},getNetworkType(){assert.fail('entry must not probe network')}})
  const page=createPage(guidesDefinition)
  page.openSearch();page.openHomeCategory({currentTarget:{dataset:{value:'study'}}});page.openDocuments();page.openAssistant()
  assert.equal(page.data.activeHomeCategory,'study')
  assert.deepEqual(routes,['/pages/guide-search/index?q=','/pages/guide-category/index?category=study','/pages/guide-documents/index','/pages/guide-assistant/index'])
})

test('concurrent catalog retries are latest-request-wins and stale errors stay silent', async t => {
  const first=deferred(),second=deferred()
  let count=0
  replaceMethod(t,publicApi,'getGuides',()=>++count===1?first.promise:second.promise)
  const page=createPage(categoryDefinition,{kind:'guide'})
  const a=page.loadGuides(),b=page.retry()
  second.resolve(guideList([guide('new')])); await b
  first.reject(Error('stale private')); await a
  assert.equal(page.data.warning,'')
  assert.deepEqual(page.data.results.map(x=>x.id),['new'])
})

test('guide category retry respects the current local topic and never shows mismatched items', async t => {
  let count=0
  replaceMethod(t,publicApi,'getGuides',async()=>{
    if(++count===1)throw Error('offline')
    return guideList([guide('a',{title:'成绩复核',category:'考试与成绩'}),guide('b',{title:'申诉',category:'规范与权益'})])
  })
  const page=createPage(categoryDefinition,{topic:'study',kind:'guide'})
  await page.loadGuides(); assert.equal(page.data.results.length,0)
  page.chooseCategory({currentTarget:{dataset:{category:'life'}}})
  await page.retry()
  assert.equal(page.data.warning,'')
  assert.deepEqual(page.data.results.map(x=>x.id),['b'])
})

test('guide local load-more preserves order without requests and rejects incomplete API snapshots', async t => {
  let count=0
  replaceMethod(t,publicApi,'getGuides',async()=>{count++;return guideList(Array.from({length:45},(_,i)=>guide(String(i))))})
  const page=createPage(searchDefinition,{kind:'guide'})
  await page.loadGuides()
  assert.equal(page.data.results.length,20)
  page.onReachBottom(); assert.equal(page.data.results.length,40)
  page.onReachBottom(); assert.equal(page.data.results.length,45)
  assert.equal(page.data.hasMore,false); assert.equal(count,1)
  // Empty second API pages must fail rather than silently omitting guides.
  await assert.rejects(catalog.loadCatalog({api:{getGuides:async()=>({items:[],total:45})}}))
})

test('an in-flight guide list response cannot call setData after unload', async t => {
  const pending=deferred()
  replaceMethod(t,publicApi,'getGuides',()=>pending.promise)
  const page=createPage(searchDefinition)
  const loading=page.loadGuides()
  page.onUnload()
  const calls=page._setDataCalls.length
  pending.resolve(guideList([guide('late')]))
  await loading
  assert.equal(page._setDataCalls.length,calls)
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
  assert.deepEqual(downloads, [
    'https://resources.nkustudy.top/guide-sources/rules.pdf',
    'https://resources.nkustudy.top/guide-sources/rules.docx'
  ])
  assert.deepEqual(opened.map(item => item.fileType), ['pdf', 'docx'])
  assert.equal(opened.every(item => item.showMenu === true), true)
  assert.deepEqual(copied, [])
  assert.deepEqual(toasts.map(item => item.title), [])
  assert.doesNotMatch(toasts.map(item => item.title).join(' '), /provider|clipboard failure/i)

  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-detail/index.wxml'), 'utf8')
  for (const field of ['title', 'category', 'scope', 'sections', 'source.title', 'source.number']) {
    assert.match(template, new RegExp(`guide\\.${field.replace('.', '\\.')}`))
  }
  assert.match(template, /查看完整原文件/)
  assert.match(template, /bindtap="copySourceUrl"/)
  assert.doesNotMatch(template, /copyCorrectionUrl|目录|收藏|分享/)
  assert.match(template, /bindtap="openInlineFeedback"/)
  assert.match(template, /feedbackPanelOpen/)
})


test('guide sections render only structured visible blocks, keep stable anchors and remeasure navigation', async t => {
  const scrolls = []
  let measures = 0
  replaceMethod(t, publicApi, 'getGuide', async () => guide('gpa-guide', {
    sections: [
      { id: 'gpa rules', title: 'GPA', body: '# 计算\n第一段\n第二段\n| 等级 | 绩点 |\n| --- | --- |\n| A | **4.0** |', source_ids: ['SRC-GPA'] },
      { id: 'gpa rules', title: '补充', body: '补充说明', source_ids: ['SRC-OTHER'] }
    ],
    sources: []
  }))
  installWx(t, {
    createSelectorQuery() {
      const query = {
        selectAll() { return query }, boundingClientRect() { return query }, selectViewport() { return query }, scrollOffset() { return query },
        exec(callback) { measures += 1; callback([[{ top: 120 }, { top: 420 }], { scrollTop: 30 }]) }
      }
      return query
    },
    pageScrollTo(options) { scrolls.push(options) }
  })
  const page = createPage(detailDefinition)

  await page.onLoad({ id: 'gpa-guide' })
  const [first, second] = page.data.guide.sections
  for (const section of [first, second]) {
    for (const key of ['body', 'blocks', 'previewBlocks', 'visibleBlocks', 'expanded', 'hasMore', 'tabId', 'anchorId']) assert.ok(Object.hasOwn(section, key))
  }
  assert.notEqual(first.id, second.id)
  assert.notEqual(first.tabId, second.tabId)
  assert.notEqual(first.anchorId, second.anchorId)
  assert.equal(first.blocks.at(-1).type, 'table')
  assert.equal(first.visibleBlocks.length, first.blocks.length)

  page.toggleSection({ currentTarget: { dataset: { id: first.id } } })
  assert.equal(page.data.guide.sections[0].expanded, false)
  assert.equal(page.data.guide.sections[0].visibleBlocks.length, first.previewBlocks.length)
  page.selectSection({ currentTarget: { dataset: { id: second.id } } })
  assert.equal(page.data.activeSectionTabId, second.tabId)
  assert.equal(scrolls.at(-1).scrollTop, 336)
  assert.equal(scrolls.at(-1).duration, 280)
  page.onPageScroll({ scrollTop: 400 })
  assert.equal(page.data.activeSectionId, second.id)
  assert.ok(measures >= 3)

  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-detail/index.wxml'), 'utf8')
  assert.match(template, /scroll-into-view="\{\{activeSectionTabId\}\}"/)
  assert.match(template, /wx:for="\{\{item\.visibleBlocks\}\}"/)
  assert.match(template, /block\.type === 'table'/)
  assert.doesNotMatch(template, /\{\{item\.(body|preview)\}\}/)
  assert.doesNotMatch(template, /_sectionTops/)
})

test('guide inline feedback stays on-page, submits only the proven payload and preserves retry input', async t => {
  const submitted = []
  const routes = []
  const copied = []
  let attempt = 0
  replaceMethod(t, feedbackApi, 'submitFeedback', async payload => {
    submitted.push(payload)
    attempt += 1
    if (attempt === 1) throw new Error('network')
    return { statusCode: 200 }
  })
  installWx(t, {
    navigateTo(options) { routes.push(options.url) },
    setClipboardData(options) { copied.push(options.data); options.success() }
  })
  const page = createPage(detailDefinition, {
    guide: {
      id: 'guide-id', title: '成绩复核', category: 'exam-grade',
      sections: [{ id: 'section-a', sourceIds: ['SRC-1', 'SRC-2'] }]
    },
    activeSectionId: 'section-a'
  })

  page.rateGuide({ currentTarget: { dataset: { value: 'unhelpful' } } })
  assert.equal(page.data.feedbackPanelOpen, true)
  page.closeInlineFeedback()
  assert.equal(page.data.feedbackPanelOpen, false)
  page.openInlineFeedback()
  assert.equal(page.data.feedbackPanelOpen, true)
  assert.equal(typeof page.noop, 'function')
  page.inputFeedbackContent({ detail: { value: '   ' } })
  await page.submitInlineFeedback()
  assert.equal(submitted.length, 0)
  page.chooseFeedbackType({ currentTarget: { dataset: { value: 'layout' } } })
  page.inputFeedbackContent({ detail: { value: '表格在小屏阅读困难' } })
  const first = page.submitInlineFeedback()
  await page.submitInlineFeedback()
  await first
  assert.equal(submitted.length, 1)
  assert.deepEqual(Object.keys(submitted[0]).sort(), ['content', 'resourceRef', 'title', 'type'])
  assert.equal(submitted[0].resourceRef, 'guide-id')
  assert.equal(submitted[0].type, 'bug')
  assert.match(submitted[0].content, /guide_id=guide-id; guide_title=成绩复核; category=exam-grade; page_path=\/pages\/guide-detail\/index; section_id=section-a; source_ids=SRC-1,SRC-2/)
  assert.equal(page.data.feedbackStatus, 'error')
  assert.equal(page.data.feedbackContent, '表格在小屏阅读困难')
  await page.submitInlineFeedback()
  assert.equal(submitted.length, 2)
  assert.equal(page.data.feedbackStatus, 'success')
  assert.equal(page.data.feedbackContent, '')
  assert.deepEqual(routes, [])
  assert.deepEqual(copied, [])

  const source = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-detail/index.js'), 'utf8')
  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-detail/index.wxml'), 'utf8')
  const styles = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-detail/index.wxss'), 'utf8')
  assert.doesNotMatch(source, /copyCorrectionUrl/)
  assert.doesNotMatch(template, /目录|收藏|分享/)
  assert.equal((template.match(/反馈本指南问题/g) || []).length, 2)
  assert.match(template, /feedback-buttons/)
  assert.match(template, /class="feedback-modal-mask"[^>]*wx:if="\{\{feedbackPanelOpen\}\}"[^>]*bindtap="closeInlineFeedback"/)
  assert.match(template, /class="inline-feedback feedback-modal-card"[^>]*catchtap="noop"/)
  assert.match(template, /aria-label="关闭反馈弹窗"/)
  assert.match(styles, /\.feedback-modal-mask\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*z-index:\s*90/s)
})

test('learning compass categories and assistant actions use the shared icon owner and accessible controls', () => {
  const learningCompass = require('../miniprogram/utils/learning-compass')
  assert.deepEqual(Object.values(learningCompass.CATEGORY_INFO).map(item => [item.symbol, item.tone]), [
    ['▥', 'purple'], ['★', 'gold'], ['学', 'green'], ['◆', 'blue'], ['⚖', 'red']
  ])
  const guideSource = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guides/index.js'), 'utf8')
  const detailTemplate = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-detail/index.wxml'), 'utf8')
  const assistantTemplate = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-assistant/index.wxml'), 'utf8')
  const assistantStyles = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-assistant/index.wxss'), 'utf8')
  const iconAssets = ['thumb-up.svg', 'thumb-up-active.svg', 'thumb-down.svg', 'thumb-down-active.svg']
  assert.match(guideSource, /TOPICS/)
  assert.doesNotMatch(guideSource, /GUIDE_PRESENTATION/)
  assert.match(detailTemplate, /本指南对你有帮助吗？<\/text><view class="feedback-buttons"/)
  for (const label of ['复制回答', '回答有帮助', '回答没有帮助']) assert.match(assistantTemplate, new RegExp(`aria-label="${label}"`))
  assert.match(assistantStyles, /\.answer-tool\s*\{[^}]*min-width:\s*80rpx[^}]*min-height:\s*80rpx/s)
  assert.match(assistantStyles, /\.answer-tool-icon\s*\{[^}]*width:\s*36rpx[^}]*height:\s*36rpx/s)
  assert.doesNotMatch(assistantTemplate, /thumb-palm|thumb-finger/)
  assert.doesNotMatch(assistantStyles, /\.thumb-palm|\.thumb-finger/)
  for (const asset of iconAssets) {
    assert.equal(fs.existsSync(path.join(projectRoot, 'miniprogram/assets/icons', asset)), true)
    assert.match(assistantTemplate, new RegExp(`/assets/icons/${asset.replace('.', '\\.')}`))
  }
})
