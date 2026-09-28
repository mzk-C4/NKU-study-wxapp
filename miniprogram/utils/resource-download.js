const DOWNLOAD_ORIGIN = 'https://resources.nkustudy.top'
const DOCUMENT_TYPES = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'])
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024
let downloading = false

function validDownloadUrl(value) {
  return typeof value === 'string' && !/[\s\\]/.test(value) && /^https:\/\/resources\.nkustudy\.top(?:\/|$)/i.test(value)
}

function copyDownloadLink(resource) {
  if (!validDownloadUrl(resource?.download_url)) return
  wx.setClipboardData({
    data: resource.download_url,
    success: () => wx.showModal({ title: '下载链接已复制', content: '请粘贴到手机或电脑浏览器下载该文件。', showCancel: false }),
    fail: () => wx.showToast({ title: '复制失败，请重试', icon: 'none' })
  })
}

function offerBrowserDownload(resource, title, content) {
  wx.showModal({
    title, content, confirmText: '复制链接', cancelText: '取消',
    success: result => { if (result.confirm) copyDownloadLink(resource) }
  })
}

function resourceFileType(resource) {
  const extension = String(resource.extension || '').trim().replace(/^\./, '').toLowerCase()
  if (/^[a-z0-9]+$/.test(extension)) return extension
  const title = String(resource.title || '').match(/\.([a-z0-9]+)$/i)
  const url = resource.download_url.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)
  return (title?.[1] || url?.[1] || '').toLowerCase()
}

function offerFileTransfer(resource, filePath) {
  if (typeof wx.shareFileMessage !== 'function') {
    offerBrowserDownload(resource, '当前微信无法打开', '可以更新微信，或复制链接到浏览器下载。')
    return
  }
  wx.showModal({
    title: '文件已下载，未能预览',
    content: '此格式或文件暂时无法在微信中预览。可转发给自己或文件传输助手，再用支持该格式的软件打开；也可复制链接到浏览器下载。',
    confirmText: '转发文件', cancelText: '复制链接',
    success(result) {
      if (result.cancel) { copyDownloadLink(resource); return }
      if (!result.confirm) return
      const type = resourceFileType(resource)
      let fileName = String(resource.title || '学习资料').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
      if (type && !fileName.toLowerCase().endsWith(`.${type}`)) fileName += `.${type}`
      wx.shareFileMessage({
        filePath, fileName,
        fail(error) {
          if (/cancel/i.test(error?.errMsg || '')) return
          offerBrowserDownload(resource, '文件转发失败', '可以复制链接到浏览器下载，或稍后重试。')
        }
      })
    }
  })
}

function showDownloadFailure(resource, options, detail) {
  const canReport = typeof options.onReport === 'function'
  wx.showModal({
    title: '下载失败',
    content: `${detail}\n\n可重试，或在更多操作中复制链接到浏览器下载${canReport ? '、反馈失效' : ''}。`,
    confirmText: '重试',
    cancelText: '更多操作',
    success(result) {
      if (result.confirm) downloadResource(resource, options)
      else if (result.cancel) wx.showActionSheet({
        itemList: canReport ? ['复制下载链接', '反馈链接失效'] : ['复制下载链接'],
        success(action) {
          if (action.tapIndex === 0) copyDownloadLink(resource)
          else if (action.tapIndex === 1 && canReport) options.onReport()
        }
      })
    }
  })
}

function downloadResource(resource, options = {}) {
  if (!validDownloadUrl(resource?.download_url)) {
    wx.showModal({ title: '下载地址不可用', content: '暂时没有可用的 NKUStudy 资源地址。', showCancel: false })
    return Promise.resolve(false)
  }
  if (Number(resource.size) > MAX_DOWNLOAD_BYTES) {
    offerBrowserDownload(resource, '文件超过微信下载上限', '微信单次下载上限为 200MB，请复制链接到浏览器下载此文件。')
    return Promise.resolve(false)
  }
  if (downloading) return Promise.resolve(false)
  downloading = true
  wx.showLoading({ title: '正在下载', mask: true })
  return new Promise(resolve => {
    let finished = false
    const finish = () => {
      finished = true
      downloading = false
      wx.hideLoading()
    }
    const task = wx.downloadFile({
      url: resource.download_url,
      timeout: 120000,
      success(result) {
        finish()
        if (result.statusCode !== 200 || !result.tempFilePath) {
          showDownloadFailure(resource, options, `下载请求返回 ${result.statusCode || '异常状态'}。`)
          resolve(false)
          return
        }
        const fileType = resourceFileType(resource)
        if (!DOCUMENT_TYPES.has(fileType)) {
          offerFileTransfer(resource, result.tempFilePath)
          resolve(false)
          return
        }
        wx.openDocument({
          filePath: result.tempFilePath,
          fileType,
          showMenu: true,
          success: () => resolve(true),
          fail: () => { offerFileTransfer(resource, result.tempFilePath); resolve(false) }
        })
      },
      fail(error) {
        finish()
        const message = error?.errMsg || ''
        if (/domain|合法域名/i.test(message)) {
          offerBrowserDownload(resource, '下载域名未配置', '请维护者在微信公众平台的 downloadFile 合法域名中配置 https://resources.nkustudy.top；不是业务域名。配置完成前可复制链接到浏览器下载。')
        } else {
          const detail = /timeout|timed out/i.test(message) ? '下载超时，请检查网络或使用浏览器下载大文件。' : '下载未完成，请检查网络和手机可用空间。'
          showDownloadFailure(resource, options, detail)
        }
        resolve(false)
      }
    })
    if (task?.onProgressUpdate) task.onProgressUpdate(progress => {
      if (!finished && Number.isFinite(progress.progress)) {
        wx.showLoading({ title: `下载中 ${Math.min(100, Math.max(0, Math.floor(progress.progress)))}%`, mask: true })
      }
    })
  })
}

module.exports = { DOWNLOAD_ORIGIN, downloadResource, validDownloadUrl, showDownloadFailure }
