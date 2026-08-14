const api = require('../../utils/request')

Page({
  data: { id: '', loading: true, error: '', course: null, resources: [], visibleResources: [], types: ['全部', '试卷', '笔记', '课件', '作业', '教材'], type: '全部' },
  onLoad(options) { this.setData({ id: options.id || '' }); this.loadResources() },

  async loadResources() {
    this.setData({ loading: true, error: '' })
    try {
      const [course, data] = await Promise.all([api.get(`/courses/${this.data.id}`), api.get(`/courses/${this.data.id}/resources`)])
      this.setData({ course, resources: data.items, visibleResources: data.items, loading: false })
      wx.setNavigationBarTitle({ title: course.name })
    } catch (error) { this.setData({ loading: false, error: error.message }) }
  },
  chooseType(event) {
    const type = event.currentTarget.dataset.type
    const visibleResources = type === '全部' ? this.data.resources : this.data.resources.filter(item => item.type === type)
    this.setData({ type, visibleResources })
  },
  openTab(event) {
    const tab = event.currentTarget.dataset.tab
    const page = tab === 'overview' ? 'course-overview' : 'course-reviews'
    wx.redirectTo({ url: `/pages/${page}/index?id=${this.data.id}` })
  },
  openResource(event) { wx.navigateTo({ url: `/pages/resource-detail/index?id=${event.currentTarget.dataset.id}` }) },
  async submitResource() {
    try { await getApp().ensureLogin(); wx.navigateTo({ url: `/pages/submit-resource/index?course_id=${this.data.id}` }) }
    catch (error) { wx.showToast({ title: error.message, icon: 'none' }) }
  }
})
