const test = require('node:test')
const assert = require('node:assert/strict')

const { createSourceOpener, officialNankaiUrl } = require('../miniprogram/utils/source-opener')
const support = require('../miniprogram/features/community-support/index')

function referencePolicy() {
  return {
    isAllowedGuideFileUrl(value) {
      return /^http:\/\/127\.0\.0\.1:3000\/__local__\/learning-compass\/source-files\/[A-Za-z0-9-]+$/.test(value)
    }
  }
}

test('reference PDF, DOC and DOCX sources use downloadFile then openDocument', async () => {
  const downloads = []
  const opened = []
  const wxApi = {
    downloadFile(options) {
      downloads.push(options.url)
      options.success({ statusCode: 200, tempFilePath: `/tmp/source-${downloads.length}` })
    },
    openDocument(options) {
      opened.push({ filePath: options.filePath, fileType: options.fileType, showMenu: options.showMenu })
      options.success()
    },
    showToast() {}
  }
  const opener = createSourceOpener({ wxApi, policy: referencePolicy() })
  for (const fileType of ['pdf', 'doc', 'docx']) {
    assert.equal(await opener.open({
      id: `source-${fileType}`,
      file_type: fileType,
      file_url: `http://127.0.0.1:3000/__local__/learning-compass/source-files/source-${fileType}`
    }), true)
  }
  assert.deepEqual(opened.map(item => item.fileType), ['pdf', 'doc', 'docx'])
  assert.equal(opened.every(item => item.showMenu), true)
})

test('production policy rejects loopback and unsafe official-page lookalikes', async () => {
  let downloadCalls = 0
  const opener = createSourceOpener({
    wxApi: {
      downloadFile() { downloadCalls += 1 },
      showToast() {}
    },
    policy: {
      isAllowedGuideFileUrl(value) {
        return /^https:\/\/resources\.nkustudy\.top\/guide-sources\//.test(value)
      }
    }
  })
  assert.equal(await opener.open({ file_type: 'pdf', file_url: 'http://127.0.0.1:3000/__local__/learning-compass/source-files/SRC-001' }), false)
  assert.equal(downloadCalls, 0)
  assert.equal(officialNankaiUrl('https://jwc.nankai.edu.cn/file.pdf'), 'https://jwc.nankai.edu.cn/file.pdf')
  assert.equal(officialNankaiUrl('https://nankai.edu.cn.evil.example/file.pdf'), '')
  assert.equal(officialNankaiUrl('javascript:alert(1)'), '')
})

test('failed opening exposes an explicit safe copy fallback without losing context', async () => {
  const phases = []
  const copied = []
  const opener = createSourceOpener({
    wxApi: {
      downloadFile(options) { options.fail() },
      openDocument() { assert.fail('openDocument must not run after a failed download') },
      setClipboardData(options) { copied.push(options.data); options.success() },
      showToast() {}
    },
    policy: referencePolicy()
  })
  const source = {
    file_type: 'pdf',
    file_url: 'http://127.0.0.1:3000/__local__/learning-compass/source-files/SRC-003',
    official_page_url: 'https://jwc.nankai.edu.cn/file.pdf'
  }
  assert.equal(await opener.open(source, { onState: state => phases.push(state) }), false)
  assert.equal(phases.at(-1).phase, 'failed')
  assert.equal(phases.at(-1).canCopy, true)
  assert.equal(await opener.copyFallback(source), true)
  assert.deepEqual(copied, ['https://jwc.nankai.edu.cn/file.pdf'])
})

test('local student PDFs open normally without reporting; public guide sources report only successful transfers', async t => {
  const events = []
  t.mock.method(support, 'downloaded', async (source, kind) => { events.push({ id: source.id, kind }) })
  const opener = createSourceOpener({ policy: referencePolicy(), wxApi: {
    downloadFile(options) { options.success({ statusCode: 200, tempFilePath: '/file' }) },
    openDocument(options) { options.success() }
  } })
  const source = { id: 's1', file_type: 'pdf', file_url: 'http://127.0.0.1:3000/__local__/learning-compass/source-files/s1' }
  assert.equal(await opener.open(source, { reportSupport: false }), true)
  assert.deepEqual(events, [])
  assert.equal(await opener.open(source), true)
  assert.deepEqual(events, [{ id: 's1', kind: 'guide_source' }])
})
