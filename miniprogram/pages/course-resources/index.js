const { publicApi } = require('../../services/public-api')
const { downloadResource } = require('../../utils/resource-download')

Page({
  data: { id: '', loading: true, error: '', course: null, resources: [], visibleResources: [], types: ['全部'], type: '全部' },
  onLoad(options) { this.setData({ id: options.id || '' }); this.loadResources() },

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
  openResource(event) { downloadResource(this.data.resources.find(item => item.id === event.currentTarget.dataset.id)) },
  submitResource() { wx.showToast({ title: '资料投稿功能建设中', icon: 'none' }) }
})
