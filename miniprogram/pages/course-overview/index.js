const { reportVisit } = require('../../utils/visit-report')
const { publicApi } = require('../../services/public-api')
const { parseMarkdown } = require('../../utils/markdown')

Page({
  onShareAppMessage() {
    return {
      title: `「${this.data.course?.name || 'NKUStudy 课程'}」- NKUStudy`,
      path: `/pages/course-overview/index?id=${this.data.id}`
    }
  },
  onShareTimeline() {
    return { title: 'NKUStudy · 南开课程资料导航' }
  },
  data: { id: '', loading: true, error: '', course: null, favorite: false, descriptionBlocks: [] },
  onLoad(options) { reportVisit('/mp/course-overview'); this.setData({ id: options.id || '' }); this.loadCourse() },

  async loadCourse() {
    if (!this.data.id) return this.setData({ loading: false, error: '缺少课程编号' })
    this.setData({ loading: true, error: '' })
    try {
      const course = await publicApi.getCourse(this.data.id)
      const history = wx.getStorageSync('browse_history') || []
      const next = [course, ...history.filter(item => item.id !== course.id)].slice(0, 20)
      wx.setStorageSync('browse_history', next)
      this.setData({ course, descriptionBlocks: parseMarkdown(course.description), loading: false })
      wx.setNavigationBarTitle({ title: course.name })
    } catch (error) { this.setData({ loading: false, error: error.message }) }
  },

  copyLink(event) {
    const href = event.currentTarget.dataset.href
    if (!href) return
    wx.setClipboardData({
      data: href,
      success() { wx.showToast({ title: '链接已复制，请在浏览器打开', icon: 'none' }) }
    })
  },

  openTab(event) {
    const tab = event.currentTarget.dataset.tab
    if (tab === 'resources') wx.redirectTo({ url: `/pages/course-resources/index?id=${this.data.id}` })
    if (tab === 'reviews') wx.redirectTo({ url: `/pages/course-reviews/index?id=${this.data.id}` })
  },

  toggleFavorite() { wx.showToast({ title: '收藏功能将在登录上线后开放', icon: 'none' }) }
})