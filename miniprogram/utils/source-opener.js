const publicApi = require('../features/learning-compass/api')

const OPENABLE_FILE_TYPES = new Set(['pdf', 'doc', 'docx'])

function currentWx() {
  if (typeof wx === 'undefined') throw new Error('微信运行环境不可用')
  return wx
}

function toText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function officialNankaiUrl(value) {
  const url = toText(value)
  if (!url || /[\s\\]/.test(url)) return ''
  const match = /^https:\/\/([^/?#]+)(?:[/?#]|$)/i.exec(url)
  if (!match || match[1].includes('@') || match[1].includes(':')) return ''
  const host = match[1].toLowerCase()
  return host === 'nankai.edu.cn' || host.endsWith('.nankai.edu.cn') ? url : ''
}

function normalizeSource(source, policy = publicApi) {
  const raw = source && typeof source === 'object' ? source : {}
  const fileUrl = toText(raw.fileUrl || raw.file_url || raw.url)
  const officialPageUrl = officialNankaiUrl(raw.officialPageUrl || raw.official_page_url)
  const fileType = toText(raw.fileType || raw.file_type).toLowerCase()
  return {
    id: toText(raw.id),
    title: toText(raw.title),
    fileUrl: policy.isAllowedGuideFileUrl(fileUrl) ? fileUrl : '',
    officialPageUrl,
    fileType: OPENABLE_FILE_TYPES.has(fileType) ? fileType : '',
    copyUrl: officialPageUrl || (policy.isAllowedGuideFileUrl(fileUrl) ? fileUrl : '')
  }
}

function createSourceOpener(options = {}) {
  const wxApi = options.wxApi || currentWx()
  const policy = options.policy || publicApi
  const opening = new Set()

  function copyFallback(source, copyOptions = {}) {
    const normalized = normalizeSource(source, policy)
    if (!normalized.copyUrl || typeof wxApi.setClipboardData !== 'function') return Promise.resolve(false)
    return new Promise(resolve => {
      wxApi.setClipboardData({
        data: normalized.copyUrl,
        success() {
          if (typeof wxApi.showToast === 'function') wxApi.showToast({ title: copyOptions.successTitle || '来源链接已复制', icon: 'success' })
          resolve(true)
        },
        fail() {
          if (typeof wxApi.showToast === 'function') wxApi.showToast({ title: '复制失败，请稍后重试', icon: 'none' })
          resolve(false)
        }
      })
    })
  }

  async function fail(source, reason, openOptions) {
    const normalized = normalizeSource(source, policy)
    if (typeof openOptions.onState === 'function') openOptions.onState({ phase: 'failed', reason, canCopy: Boolean(normalized.copyUrl) })
    if (openOptions.autoCopyFallback && normalized.copyUrl) return copyFallback(source, { successTitle: '官方链接已复制' })
    if (typeof wxApi.showToast === 'function') wxApi.showToast({ title: openOptions.failureTitle || '暂时无法打开该原文件', icon: 'none' })
    return false
  }

  async function open(source, openOptions = {}) {
    const normalized = normalizeSource(source, policy)
    if (!normalized.fileUrl || !normalized.fileType) return fail(source, 'invalid-source', openOptions)
    if (opening.has(normalized.fileUrl)) return false
    if (typeof wxApi.downloadFile !== 'function' || typeof wxApi.openDocument !== 'function') return fail(source, 'unsupported', openOptions)
    opening.add(normalized.fileUrl)
    if (typeof openOptions.onState === 'function') openOptions.onState({ phase: 'opening', canCopy: Boolean(normalized.copyUrl) })
    try {
      const download = await new Promise(resolve => {
        wxApi.downloadFile({ url: normalized.fileUrl, success: resolve, fail: () => resolve(null) })
      })
      if (!download || !download.tempFilePath || (download.statusCode && download.statusCode !== 200)) {
        return fail(source, 'download-failed', openOptions)
      }
      const opened = await new Promise(resolve => {
        wxApi.openDocument({
          filePath: download.tempFilePath,
          fileType: normalized.fileType,
          showMenu: true,
          success: () => resolve(true),
          fail: () => resolve(false)
        })
      })
      if (!opened) return fail(source, 'open-failed', openOptions)
      if (typeof openOptions.onState === 'function') openOptions.onState({ phase: 'opened', canCopy: Boolean(normalized.copyUrl) })
      return true
    } finally {
      opening.delete(normalized.fileUrl)
    }
  }

  return { open, copyFallback, normalizeSource: source => normalizeSource(source, policy) }
}

module.exports = { OPENABLE_FILE_TYPES, officialNankaiUrl, normalizeSource, createSourceOpener }
