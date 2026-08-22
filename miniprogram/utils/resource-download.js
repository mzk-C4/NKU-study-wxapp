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
        wx.showToast({ title: `下载失败（${result.statusCode || '未知'}）`, icon: 'none' })
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
      wx.showToast({ title: error.errMsg?.includes('domain') ? '请先配置资源下载合法域名' : '下载失败，请稍后重试', icon: 'none' })
    }
  })
}

module.exports = { DOWNLOAD_ORIGIN, downloadResource, validDownloadUrl }
