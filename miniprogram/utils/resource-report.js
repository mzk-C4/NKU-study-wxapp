const FEEDBACK_ENDPOINT = 'https://nkustudy.top/feedback-api/submit'

function buildResourceReference(courseName, resource) {
  return [courseName, resource?.section || resource?.type, resource?.title]
    .filter(Boolean)
    .join(' / ')
    .slice(0, 200)
}

function sendDeadLinkReport(courseName, resource, note = '') {
  const title = `资源失效：${resource?.title || '未知资源'}`.slice(0, 100)
  const reference = buildResourceReference(courseName, resource) || '未知资源'
  const details = note.trim().slice(0, 500)
  return new Promise((resolve, reject) => {
    wx.request({
      url: FEEDBACK_ENDPOINT,
      method: 'POST',
      timeout: 10000,
      header: { 'content-type': 'application/json' },
      data: {
        title,
        content: [`资源：${reference}`, details || '下载失败，请检查该资源链接。'].join('\n\n'),
        type: 'content',
        contact: '',
        website: ''
      },
      success(response) {
        const payload = response.data || {}
        if (response.statusCode >= 200 && response.statusCode < 300 && payload.ok !== false) resolve(payload)
        else reject(new Error(payload.error || `反馈提交失败（${response.statusCode || '未知'}）`))
      },
      fail: reject
    })
  })
}

function reportDeadLink(courseName, resource) {
  wx.showModal({
    title: '反馈资源失效',
    content: '',
    editable: true,
    placeholderText: '补充说明（可留空）',
    confirmText: '提交反馈',
    confirmColor: '#4B1F6F',
    success(result) {
      if (!result.confirm) return
      wx.showLoading({ title: '正在提交' })
      sendDeadLinkReport(courseName, resource, result.content || '')
        .then(() => wx.showToast({ title: '已反馈，感谢', icon: 'success' }))
        .catch(() => wx.showToast({ title: '反馈发送失败', icon: 'none' }))
        .finally(() => wx.hideLoading())
    }
  })
}

module.exports = { FEEDBACK_ENDPOINT, buildResourceReference, sendDeadLinkReport, reportDeadLink }
