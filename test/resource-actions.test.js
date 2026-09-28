const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { buildResourceReference, sendDeadLinkReport } = require('../miniprogram/utils/resource-report')
const { showDownloadFailure, downloadResource, validDownloadUrl } = require('../miniprogram/utils/resource-download')

test('dead-link report keeps a concise resource reference and rejects non-2xx responses', async () => {
  const originalWx = global.wx
  const resource = { title: '期末试卷.pdf', section: '历年试题' }
  assert.equal(buildResourceReference('概率论', resource), '概率论 / 历年试题 / 期末试卷.pdf')

  let request = null
  global.wx = {
    request(options) {
      request = options
      options.success({ statusCode: 503, data: {} })
    }
  }

  await assert.rejects(sendDeadLinkReport('概率论', resource, '链接打不开'), /503/)
  assert.equal(request.url, 'https://nkustudy.top/feedback-api/submit')
  assert.deepEqual(request.data, {
    title: '资源失效：期末试卷.pdf',
    content: '资源：概率论 / 历年试题 / 期末试卷.pdf\n\n链接打不开',
    type: 'content',
    contact: '',
    website: ''
  })
  global.wx = originalWx
})

test('download failure offers retry and dead-link feedback', () => {
  const originalWx = global.wx
  let reportCount = 0
  let downloadCount = 0
  let modal = null
  global.wx = {
    showModal(options) { modal = options },
    showLoading() {},
    hideLoading() {},
    showActionSheet(options) { options.success({ tapIndex: 1 }) },
    downloadFile(options) { downloadCount += 1; options.fail({ errMsg: 'network error' }) }
  }

  const resource = { download_url: 'https://resources.nkustudy.top/resources/test.pdf' }
  const options = { onReport() { reportCount += 1 } }
  showDownloadFailure(resource, options, '网络中断。')
  assert.equal(modal.cancelText, '更多操作')
  modal.success({ cancel: true })
  assert.equal(reportCount, 1)
  modal.success({ confirm: true })
  assert.equal(downloadCount, 1)
  global.wx = originalWx
})

function mockDownload(t, overrides = {}) {
  const originalWx = global.wx
  const calls = { modals: [], downloads: [], documents: [], transfers: [], loading: [], hidden: 0, copied: [] }
  global.wx = {
    showModal(options) { calls.modals.push(options) },
    showLoading(options) { calls.loading.push(options) },
    hideLoading() { calls.hidden += 1 },
    showToast() {},
    downloadFile(options) { calls.downloads.push(options) },
    openDocument(options) { calls.documents.push(options); options.success() },
    shareFileMessage(options) { calls.transfers.push(options) },
    setClipboardData(options) { calls.copied.push(options.data); options.success() },
    ...overrides
  }
  t.after(() => { global.wx = originalWx })
  return calls
}

const sample = { title: '测试资料.pdf', extension: 'PDF', size: 54217512, download_url: 'https://resources.nkustudy.top/resources/test.pdf' }

test('resource download retains exact HTTPS host validation', async t => {
  const calls = mockDownload(t)
  for (const url of ['https://resources.nkustudy.top.evil/a', 'https://resources.nkustudy.top:443/a', 'http://resources.nkustudy.top/a', 'https://resources.nkustudy.top/a b', 'https://resources.nkustudy.top/a\\b']) {
    assert.equal(validDownloadUrl(url), false)
    assert.equal(await downloadResource({ ...sample, download_url: url }), false)
  }
  assert.equal(calls.downloads.length, 0)
})

test('large PDF download shows progress, blocks double taps and opens the document', async t => {
  let progress
  const calls = mockDownload(t, { downloadFile(options) {
    calls.downloads.push(options)
    return { onProgressUpdate(callback) { progress = callback } }
  } })
  const pending = downloadResource(sample)
  assert.equal(await downloadResource(sample), false)
  assert.equal(calls.downloads.length, 1)
  assert.equal(calls.downloads[0].timeout, 120000)
  progress({ progress: 45 })
  assert.equal(calls.loading.at(-1).title, '下载中 45%')
  calls.downloads[0].success({ statusCode: 200, tempFilePath: '/tmp/pdf' })
  assert.equal(await pending, true)
  assert.equal(calls.documents[0].fileType, 'pdf')
  assert.equal(calls.documents[0].showMenu, true)
  const count = calls.loading.length
  progress({ progress: 100 })
  assert.equal(calls.loading.length, count)
  assert.equal(calls.hidden, 1)
})

test('unsupported archives offer an explicit transfer with a usable filename, not sandbox save', async t => {
  const calls = mockDownload(t)
  const pending = downloadResource({ ...sample, title: '课程资料.zip', extension: 'ZIP' })
  calls.downloads[0].success({ statusCode: 200, tempFilePath: '/tmp/random' })
  assert.equal(await pending, false)
  assert.equal(calls.documents.length, 0)
  assert.equal(calls.transfers.length, 0)
  calls.modals[0].success({ confirm: true })
  assert.equal(calls.transfers[0].fileName, '课程资料.zip')
  assert.equal(calls.transfers[0].filePath, '/tmp/random')
  assert.doesNotMatch(calls.modals[0].content, /已保存|文件管理/)
  calls.transfers[0].fail({ errMsg: 'shareFileMessage:fail cancel' })
  assert.equal(calls.modals.length, 1)
})

test('preview failure offers transfer or browser download without claiming save success', async t => {
  const calls = mockDownload(t, { openDocument(options) { options.fail({ errMsg: 'cannot open' }) } })
  const pending = downloadResource(sample)
  calls.downloads[0].success({ statusCode: 200, tempFilePath: '/tmp/pdf' })
  assert.equal(await pending, false)
  calls.modals[0].success({ cancel: true })
  assert.deepEqual(calls.copied, [sample.download_url])
})

test('older WeChat and failed transfer offer browser fallback', async t => {
  const calls = mockDownload(t, { shareFileMessage: undefined })
  const pending = downloadResource({ ...sample, extension: 'ZIP' })
  calls.downloads[0].success({ statusCode: 200, tempFilePath: '/tmp/zip' })
  await pending
  assert.match(calls.modals[0].content, /更新微信/)
  calls.modals[0].success({ confirm: true })
  assert.deepEqual(calls.copied, [sample.download_url])
})

test('files beyond platform limit skip download and offer the original browser link', async t => {
  const calls = mockDownload(t)
  assert.equal(await downloadResource({ ...sample, size: 200 * 1024 * 1024 + 1 }), false)
  assert.equal(calls.downloads.length, 0)
  assert.match(calls.modals[0].content, /200MB/)
})

test('domain configuration failure identifies downloadFile, not web-view business domain', async t => {
  const calls = mockDownload(t)
  const pending = downloadResource(sample)
  calls.downloads[0].fail({ errMsg: 'downloadFile:fail url not in domain list' })
  assert.equal(await pending, false)
  assert.match(calls.modals[0].content, /downloadFile.*https:\/\/resources\.nkustudy\.top/)
  calls.modals[0].success({ confirm: true })
  assert.deepEqual(calls.copied, [sample.download_url])
})

test('HTTP errors and empty downloads never reach document opening; later retry is allowed', async t => {
  const calls = mockDownload(t)
  for (const response of [{ statusCode: 403, tempFilePath: '/tmp/html' }, { statusCode: 200 }]) {
    const pending = downloadResource(sample)
    calls.downloads.at(-1).success(response)
    assert.equal(await pending, false)
  }
  assert.equal(calls.downloads.length, 2)
  assert.equal(calls.documents.length, 0)
})

test('extension is normalized or inferred before opening supported office documents', async t => {
  const calls = mockDownload(t)
  for (const resource of [{ ...sample, extension: ' .PPTX ' }, { ...sample, extension: '', title: '资料.docx' }]) {
    const pending = downloadResource(resource)
    calls.downloads.at(-1).success({ statusCode: 200, tempFilePath: '/tmp/file' })
    assert.equal(await pending, true)
  }
  assert.deepEqual(calls.documents.map(item => item.fileType), ['pptx', 'docx'])
})

test('course pages expose share cards that return to course overview', () => {
  const pages = ['course-overview', 'course-resources', 'course-reviews']
  for (const page of pages) {
    const directory = path.join(__dirname, '..', 'miniprogram', 'pages', page)
    const source = fs.readFileSync(path.join(directory, 'index.js'), 'utf8')
    const config = JSON.parse(fs.readFileSync(path.join(directory, 'index.json'), 'utf8'))
    assert.match(source, /onShareAppMessage\s*\(/)
    assert.match(source, /pages\/course-overview\/index\?id=/)
    assert.equal(config.enableShareAppMessage, true)
    assert.equal(config.enableShareTimeline, true)
  }
})
