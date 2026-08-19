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

function downloadFailureModal(resource, detail) {
  wx.showModal({
    title: '下载失败',
    content: `${detail}

可以重试，或向管理员反馈该资源失效。`,
    confirmText: '重试',
    cancelText: '反馈失效',
    success(result) {
      if (result.confirm) downloadResource(resource)
      else if (result.cancel && typeof resource?.onReport === 'function') resource.onReport(resource)
    }
  })
}

function downloadResource(resource) {
  if (!validDownloadUrl(resource?.download_url)) {
    wx.showModal({ title: '下载地址不可用', content: '服务器没有返回合法的 NKUStudy 资源地址。', showCancel: false })
    return
  }
  wx.showLoading({ title: '正在下载' })
  wx.downloadFile({
    url: resource.download_url,
    timeout: 30000,
    success(result) {
      wx.hideLoading()
      if (result.statusCode !== 200 || !result.tempFilePath) {
        downloadFailureModal(resource, `服务器返回 ${result.statusCode || '异常状态'}。`)
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
      downloadFailureModal(resource, error.errMsg?.includes('domain') ? '资源域名未配置为合法下载域名。' : '网络中断或超时。')
    }
  })
}

module.exports = { DOWNLOAD_ORIGIN, downloadResource, validDownloadUrl }
