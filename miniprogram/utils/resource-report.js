const FEEDBACK_ENDPOINT = 'https://nkustudy.top/feedback-api/submit'

/**
 * 资源失效反馈：走网站公开反馈通道（免登录、进反馈审核流），
 * resourceRef 携带「课程 / 板块 / 文件」定位，管理端反馈列表直接展示。
 */
function reportDeadLink(courseName, resource) {
  const ref = `${courseName || ''} / ${resource?.section || ''} / ${resource?.title || ''}`.replace(/ \/ \/ /g, ' / ').slice(0, 200)
  wx.showModal({
    title: '反馈资源失效',
    editable: true,
    placeholderText: '补充说明（可留空）',
    content: '',
    success(result) {
      if (!result.confirm) return
      wx.request({
        url: FEEDBACK_ENDPOINT,
        method: 'POST',
        header: { 'content-type': 'application/json' },
        data: {
          title: `资源失效：${resource?.title || '未知资源'}`,
          content: (result.content || '').trim() || '下载失败，请检查该资源链接。',
          type: 'content',
          resourceRef: ref
        },
        success: () => wx.showToast({ title: '已反馈，感谢', icon: 'success' }),
        fail: () => wx.showToast({ title: '反馈发送失败', icon: 'none' })
      })
    }
  })
}

module.exports = { reportDeadLink }
