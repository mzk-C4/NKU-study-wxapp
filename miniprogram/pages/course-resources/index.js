const { reportVisit } = require('../../utils/visit-report')
const { publicApi } = require('../../services/public-api')
const { downloadResource } = require('../../utils/resource-download')

Page({
  onShareAppMessage() {
    return {
      title: `「${this.data.course?.name || 'NKUStudy 课程'}」资料 - NKUStudy`,
      path: `/pages/course-overview/index?id=${encodeURIComponent(this.data.id)}`
    }
  },
  onShareTimeline() {
    return { title: `${this.data.course?.name || '南开课程'}资料 · NKUStudy` }
  },
  data: { id: '', loading: true, error: '', course: null, resources: [], visibleResources: [], types: ['全部'], type: '全部' },
  onLoad(options) { reportVisit('/mp/course-resources'); this.setData({ id: options.id || '' }); this.loadResources() },

  async loadResources() {
    this.setData({ loading: true, error: '' })
    try {
      const [course, data] = await Promise.all([publicApi.getCourse(this.data.id), publicApi.getCourseResources(this.data.id)])
      const types = ['全部', ...new Set(data.items.map(item => item.type || item.section).filter(Boolean))]
      this.setData({ course, resources: data.items, visibleResources: data.items, types, type: '全部', loading: false })
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
  openResource(event) {
    const resource = this.data.resources.find(item => item.id === event.currentTarget.dataset.id)
    if (resource) {
      wx.navigateTo({ url: `/pages/resource-detail/index?courseId=${this.data.id}&resourceId=${resource.id}` })
    }
  },
  submitResource() {
    wx.navigateTo({ url: '/pages/submit-resource/index' })
  }
})
