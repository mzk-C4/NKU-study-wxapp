/**
 * 指南针首页（HXR-COMPASS）
 * 提供 AI 问答入口，可一键进入问答页，或带示例问题作为草稿进入。
 */
const config = require('../../../config/index')

Page({
  data: {
    suggestions: config.COMPASS ? config.COMPASS.SUGGESTIONS : []
  },

  // 进入问答页（无草稿）
  onStart() {
    wx.navigateTo({ url: '/pages/compass/chat/chat' })
  },

  // 带示例问题（草稿）进入问答页
  onSuggestion(e) {
    const q = e.currentTarget.dataset.q || ''
    wx.navigateTo({ url: '/pages/compass/chat/chat?draft=' + encodeURIComponent(q) })
  },

  // 返回指南搜索
  onBackToGuide() {
    wx.navigateBack({ delta: 1, fail: () => {
      wx.switchTab({ url: '/pages/course/resources/resources', fail: () => {} })
    } })
  }
})
