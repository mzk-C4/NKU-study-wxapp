const DOWNLOAD_ORIGIN = 'https://resources.nkustudy.top'

function validDownloadUrl(value) {
  return typeof value === 'string' && /^https:\/\/resources\.nkustudy\.top(?:\/|$)/.test(value)
}

function saveTemporaryFile(tempFilePath) {
  wx.saveFile({
    tempFilePath,
    success: () => wx.showModal({ title: '文件已保存', content: '已保存到小程序文件中，可从微信文件管理中查看。', showCancel: false }),
    fail: () => wx.showModal({ title: '暂时无法打开', content: '文件已经下载，但当前格式无法直接预览或保存。', showCancel: false })
  })
}

function showDownloadFailure(resource, options, detail) {
  const canReport = typeof options.onReport === 'function'
  wx.showModal({
    title: '下载失败',
    content: `${detail}\n\n可以重试${canReport ? '，或反馈该资源失效' : ''}。`,
    confirmText: '重试',
    cancelText: canReport ? '反馈失效' : '取消',
    success(result) {
      if (result.confirm) downloadResource(resource, options)
      else if (result.cancel && canReport) options.onReport()
    }
  })
}

function downloadResource(resource, options = {}) {
  if (!validDownloadUrl(resource?.download_url)) {
    wx.showModal({ title: '下载地址不可用', content: '暂时没有可用的 NKUStudy 资源地址。', showCancel: false })
    return
  }
  wx.showLoading({ title: '正在下载' })
  wx.downloadFile({
    url: resource.download_url,
    timeout: 30000,
    success(result) {
      wx.hideLoading()
      if (result.statusCode !== 200 || !result.tempFilePath) {
        showDownloadFailure(resource, options, `下载请求返回 ${result.statusCode || '异常状态'}。`)
        return
      }
      wx.openDocument({
        filePath: result.tempFilePath,
        fileType: resource.extension ? resource.extension.toLowerCase() : undefined,
        showMenu: true,
        fail: () => saveTemporaryFile(result.tempFilePath)
      })
    },
    fail(error) {
      wx.hideLoading()
      const detail = error.errMsg?.includes('domain') ? '资源域名尚未配置为合法下载域名。' : '网络中断或请求超时。'
      showDownloadFailure(resource, options, detail)
    }
  })
}

module.exports = { DOWNLOAD_ORIGIN, downloadResource, validDownloadUrl, showDownloadFailure }
