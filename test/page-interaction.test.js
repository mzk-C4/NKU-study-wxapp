const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const publicApi = require('../miniprogram/services/public-api')

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
  const page = { ...definition, data: { ...JSON.parse(JSON.stringify(definition.data)), ...data }, _setDataCalls: [] }
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

function installWx(t, implementation) {
  const hadWx = Object.hasOwn(global, 'wx')
  const previousWx = global.wx
  global.wx = implementation
  t.after(() => {
    if (hadWx) global.wx = previousWx
    else delete global.wx
  })
}

function courseResult(id, total = 1, page = 1) {
  return {
    items: [{ id, name: id }],
    total,
    page,
    page_size: 20,
    facets: {
      groups: [`${id}-group`],
      terms: [`${id}-term`],
      tags: [`${id}-tag`],
      assessments: [`${id}-assessment`]
    }
  }
}

const coursesDefinition = capturePage('miniprogram/pages/courses/index.js')
const resourcesDefinition = capturePage('miniprogram/pages/course-resources/index.js')
const homeDefinition = capturePage('miniprogram/pages/home/index.js')

test('course filters keep the latest response, facets and pagination when responses finish out of order', async t => {
  const pending = [deferred(), deferred()]
  const queries = []
  replaceMethod(t, publicApi, 'getCourses', query => {
    queries.push(query)
    return pending[queries.length - 1].promise
  })
  installWx(t, { showToast() {} })
  const page = createPage(coursesDefinition)

  const oldRequest = page.loadCourses()
  page.setData({ group: '最新筛选' })
  const latestRequest = page.loadCourses()

  pending[1].resolve(courseResult('latest'))
  await latestRequest
  pending[0].resolve(courseResult('old', 40, 2))
  await oldRequest

  assert.equal(queries[0].group, '')
  assert.equal(queries[1].group, '最新筛选')
  assert.deepEqual(page.data.courses.map(item => item.id), ['latest'])
  assert.equal(page.data.total, 1)
  assert.equal(page.data.page, 1)
  assert.equal(page.data.hasMore, false)
  assert.deepEqual(page.data.groupOptions, ['全部', 'latest-group'])
  assert.deepEqual(page.data.termOptions, ['全部', 'latest-term'])
  assert.deepEqual(page.data.tagOptions, ['全部', 'latest-tag'])
  assert.deepEqual(page.data.assessmentOptions, ['全部', 'latest-assessment'])
})

test('a stale course error stays silent after a newer success and cannot end another current loading state', async t => {
  const pending = [deferred(), deferred(), deferred()]
  const toasts = []
  let callIndex = 0
  replaceMethod(t, publicApi, 'getCourses', () => pending[callIndex++].promise)
  installWx(t, { showToast(options) { toasts.push(options) } })
  const page = createPage(coursesDefinition)

  const oldRequest = page.loadCourses()
  page.setData({ term: '最新阶段' })
  const successfulRequest = page.loadCourses()
  pending[1].resolve(courseResult('successful'))
  await successfulRequest

  const currentRequest = page.loadCourses()
  pending[0].reject(new Error('旧请求底层错误'))
  await oldRequest

  assert.deepEqual(page.data.courses.map(item => item.id), ['successful'])
  assert.equal(page.data.loading, true)
  assert.deepEqual(toasts, [])

  pending[2].resolve(courseResult('current'))
  await currentRequest
  assert.deepEqual(page.data.courses.map(item => item.id), ['current'])
  assert.equal(page.data.loading, false)
})

test('an old append response cannot add courses to a newly filtered list', async t => {
  const pending = [deferred(), deferred()]
  const queries = []
  replaceMethod(t, publicApi, 'getCourses', query => {
    queries.push(query)
    return pending[queries.length - 1].promise
  })
  installWx(t, { showToast() {} })
  const page = createPage(coursesDefinition, {
    loading: false,
    courses: [{ id: 'old-first-page' }],
    total: 40,
    page: 1,
    hasMore: true,
    group: '旧筛选'
  })

  const oldAppend = page.loadCourses({ append: true })
  page.setData({ group: '新筛选' })
  const newFilter = page.loadCourses()
  pending[1].resolve(courseResult('new-filter'))
  await newFilter
  pending[0].resolve(courseResult('old-second-page', 40, 2))
  await oldAppend

  assert.deepEqual(queries.map(query => [query.group, query.page]), [['旧筛选', 2], ['新筛选', 1]])
  assert.deepEqual(page.data.courses.map(item => item.id), ['new-filter'])
  assert.equal(page.data.total, 1)
  assert.equal(page.data.page, 1)
  assert.equal(page.data.hasMore, false)
})

test('an in-flight course response cannot call setData after page unload', async t => {
  const pending = deferred()
  replaceMethod(t, publicApi, 'getCourses', () => pending.promise)
  installWx(t, { showToast() {} })
  const page = createPage(coursesDefinition)

  const request = page.loadCourses()
  page.onUnload()
  const callsAtUnload = page._setDataCalls.length
  pending.resolve(courseResult('late'))
  await request

  assert.equal(page._setDataCalls.length, callsAtUnload)
  assert.deepEqual(page.data.courses, [])
})

test('an unavailable resource shows one honest action and never starts a download', async t => {
  const modals = []
  let downloads = 0
  installWx(t, {
    showModal(options) { modals.push(options) },
    showToast() {},
    downloadFile() { downloads += 1 }
  })
  const page = createPage(resourcesDefinition, {
    resources: [{
      id: 'resource-unavailable',
      download_available: false,
      download_url: 'https://resources.nkustudy.top/resources/unavailable.pdf'
    }]
  })

  await page.openResource({ currentTarget: { dataset: { id: 'resource-unavailable' } } })

  assert.equal(downloads, 0)
  assert.equal(modals.length, 1)
  assert.equal(modals[0].title, '暂时无法下载')
  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/course-resources/index.wxml'), 'utf8')
  assert.match(template, /!item\.download_available \? '暂不可下载'/)
  assert.doesNotMatch(template, /downloadingId === item\.id \? '正在下载' : '下载并打开'/)
})

test('resource clicks during a download give feedback and cannot start a second download', async t => {
  const toasts = []
  let downloads = 0
  installWx(t, {
    showModal() {},
    showToast(options) { toasts.push(options) },
    downloadFile() { downloads += 1 }
  })
  const url = 'https://resources.nkustudy.top/resources/file.pdf'
  const page = createPage(resourcesDefinition, {
    downloadingId: 'resource-one',
    resources: [
      { id: 'resource-one', download_available: true, download_url: url },
      { id: 'resource-two', download_available: true, download_url: url }
    ]
  })

  await page.openResource({ currentTarget: { dataset: { id: 'resource-one' } } })
  await page.openResource({ currentTarget: { dataset: { id: 'resource-two' } } })

  assert.equal(downloads, 0)
  assert.deepEqual(toasts.map(item => item.title), ['该资料正在下载', '已有资料正在下载'])
})

for (const scenario of [
  { name: 'download failure', download: 'fail', open: 'skip', modal: true },
  { name: 'open failure', download: 'success', open: 'fail', modal: true },
  { name: 'successful open', download: 'success', open: 'success', modal: false }
]) {
  test(`resource state is cleared after ${scenario.name}`, async t => {
    const modals = []
    let openCalls = 0
    installWx(t, {
      showModal(options) { modals.push(options) },
      showToast() {},
      downloadFile(options) {
        if (scenario.download === 'fail') options.fail({ errMsg: 'provider=private domain list failure' })
        else options.success({ statusCode: 200, tempFilePath: 'controlled-temp-file.pdf' })
      },
      openDocument(options) {
        openCalls += 1
        if (scenario.open === 'fail') options.fail({ errMsg: 'provider internal open failure' })
        else options.success()
      }
    })
    const page = createPage(resourcesDefinition, {
      resources: [{
        id: 'resource-file',
        download_available: true,
        download_url: 'https://resources.nkustudy.top/resources/file.pdf'
      }]
    })

    await page.openResource({ currentTarget: { dataset: { id: 'resource-file' } } })

    assert.equal(page.data.downloadingId, '')
    assert.equal(openCalls, scenario.open === 'skip' ? 0 : 1)
    assert.equal(modals.length, scenario.modal ? 1 : 0)
    const userText = modals.map(item => `${item.title} ${item.content}`).join(' ')
    assert.doesNotMatch(userText, /provider|domain list|resources\.nkustudy\.top/i)
  })
}

test('home enters a full empty state for a stable but content-free response', async t => {
  replaceMethod(t, publicApi, 'getHome', async () => ({ announcement: '', hot_courses: [], latest_updates: [] }))
  const page = createPage(homeDefinition)

  await page.loadHome()

  assert.equal(page.data.loading, false)
  assert.equal(page.data.error, '')
  assert.equal(page.data.hasPublicContent, false)
  assert.deepEqual(page.data.hotCourses, [])
  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/home/index.wxml'), 'utf8')
  assert.match(template, /empty="\{\{!loading && !error && !hasPublicContent\}\}"/)
  assert.match(template, /class="section" wx:if="\{\{hotCourses\.length\}\}"/)
  assert.match(template, /选课指南建设中/)
  assert.match(template, /非南开大学官方平台/)
})

test('home does not misclassify any real public section as an overall empty state', async t => {
  const responses = [
    { announcement: '公开通知', hot_courses: [], latest_updates: [] },
    { announcement: '', hot_courses: [{ id: 'course' }], latest_updates: [] },
    { announcement: '', hot_courses: [], latest_updates: [{ id: 'update' }] }
  ]
  replaceMethod(t, publicApi, 'getHome', async () => responses.shift())

  for (let index = 0; index < 3; index += 1) {
    const page = createPage(homeDefinition)
    await page.loadHome()
    assert.equal(page.data.hasPublicContent, true)
  }
})

test('course tags and state retry controls keep honest, mutually exclusive template states', () => {
  const overview = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/course-overview/index.wxml'), 'utf8')
  const stateTemplate = fs.readFileSync(path.join(projectRoot, 'miniprogram/components/state-view/index.wxml'), 'utf8')
  const stateStyle = fs.readFileSync(path.join(projectRoot, 'miniprogram/components/state-view/index.wxss'), 'utf8')

  assert.match(overview, /class="tag-list" wx:if="\{\{course\.tags\.length\}\}"/)
  assert.match(overview, /wx:else>暂时没有可展示的课程标签。/)
  assert.ok(stateTemplate.indexOf('wx:if="{{loading}}"') < stateTemplate.indexOf('wx:elif="{{error}}"'))
  assert.ok(stateTemplate.indexOf('wx:elif="{{error}}"') < stateTemplate.indexOf('wx:elif="{{empty}}"'))
  assert.match(stateTemplate, /<button class="retry" hover-class="retry--pressed"/)
  assert.match(stateStyle, /\.retry \{[^}]*height: 88rpx;[^}]*line-height: 88rpx;/)
  assert.match(stateStyle, /\.retry--pressed \{[^}]*opacity:/)
})
