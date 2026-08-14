const { publicApi } = require('../../services/public-api')

Page({
  data: { id: '', loading: true, error: '', course: null, favorite: false },
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

  openTab(event) {
    const tab = event.currentTarget.dataset.tab
    if (tab === 'resources') wx.redirectTo({ url: `/pages/course-resources/index?id=${this.data.id}` })
    if (tab === 'reviews') wx.redirectTo({ url: `/pages/course-reviews/index?id=${this.data.id}` })
  },

  toggleFavorite() { wx.showToast({ title: '收藏功能将在登录上线后开放', icon: 'none' }) }
})
