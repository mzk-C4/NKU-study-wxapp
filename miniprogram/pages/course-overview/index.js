const api = require('../../utils/request')

Page({
  data: { id: '', loading: true, error: '', course: null, favorite: false },
  onLoad(options) { this.setData({ id: options.id || '' }); this.loadCourse() },

  async loadCourse() {
    if (!this.data.id) return this.setData({ loading: false, error: '缺少课程编号' })
    this.setData({ loading: true, error: '' })
    try {
      const course = await api.get(`/courses/${this.data.id}`)
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

  async toggleFavorite() {
    try {
      await getApp().ensureLogin()
      if (this.data.favorite) await api.delete(`/favorites/${this.data.id}`)
      else await api.post('/favorites', { course_id: this.data.id })
      this.setData({ favorite: !this.data.favorite })
      wx.showToast({ title: this.data.favorite ? '已加入收藏' : '已取消收藏' })
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }) }
  }
})
