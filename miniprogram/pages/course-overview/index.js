const publicApi = require('../../services/public-api')

Page({
  data: { id: '', loading: true, error: '', course: null },
  onLoad(options) { this.setData({ id: options.id || '' }); this.loadCourse() },

  async loadCourse() {
    if (!this.data.id) return this.setData({ loading: false, error: '缺少课程编号' })
    this.setData({ loading: true, error: '' })
    try {
      const course = await publicApi.getCourse(this.data.id)
      const history = wx.getStorageSync('browse_history') || []
      const next = [course, ...history.filter(item => item.id !== course.id)].slice(0, 20)
      wx.setStorageSync('browse_history', next)
      this.setData({ course, loading: false })
      wx.setNavigationBarTitle({ title: course.name })
    } catch (error) { this.setData({ loading: false, error: error.message }) }
  },

  showFavoriteUnavailable() {
    wx.showModal({ title: '收藏暂未开放', content: '功能建设中，暂未连接线上服务。', showCancel: false })
  }
})
