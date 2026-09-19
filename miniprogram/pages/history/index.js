const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')

// 最近浏览为本机数据（browse_history），仅在本地保存
Page({
  data: { history: [] },

  onLoad() { reportVisit('/mp/history') },
  onShow() {
    theme.onPageShow()
    this.setData({ history: wx.getStorageSync('browse_history') || [] })
  },

  openHistory(event) {
    const id = event.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: `/pages/course-overview/index?id=${encodeURIComponent(id)}` })
  },

  clearHistory() {
    wx.showModal({
      title: '清空浏览记录',
      content: '浏览记录仅保存在本机，清空后无法恢复。',
      confirmColor: '#dc2626',
      success: result => {
        if (!result.confirm) return
        wx.removeStorageSync('browse_history')
        this.setData({ history: [] })
        wx.showToast({ title: '已清空', icon: 'success' })
      }
    })
  }
})
