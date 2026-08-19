const { reportVisit } = require('../../utils/visit-report')
const { publicApi } = require('../../services/public-api')
const { downloadResource } = require('../../utils/resource-download')
const auth = require('../../services/auth')

function reportDeadLink(courseName, resource) {
  const ref = `${courseName} / ${resource.section || ''} / ${resource.title}`
  wx.showModal({
    title: '反馈资源失效',
    editable: true,
    placeholderText: '补充说明（可留空）',
    content: '',
    success(result) {
      if (!result.confirm) return
      wx.request({
        url: 'https://nkustudy.top/feedback-api/submit',
        method: 'POST',
        header: { 'content-type': 'application/json' },
        data: {
          title: `资源失效：${resource.title}`,
          content: (result.content || '').trim() || '下载失败，请检查该资源链接。',
          type: 'content',
          resourceRef: ref.slice(0, 200)
        },
        success: () => wx.showToast({ title: '已反馈，感谢', icon: 'success' }),
        fail: () => wx.showToast({ title: '反馈发送失败', icon: 'none' })
      })
    }
  })
}

Page({
  data: { id: '', loading: true, error: '', course: null, resources: [], visibleResources: [], types: ['全部'], type: '全部', favorite: false },
  onLoad(options) { reportVisit('/mp/course-resources'); this.setData({ id: options.id || '' }); this.loadResources() },

  async loadResources() {
    this.setData({ loading: true, error: '' })
    try {
      const [course, data] = await Promise.all([publicApi.getCourse(this.data.id), publicApi.getCourseResources(this.data.id)])
      const types = ['全部', ...new Set(data.items.map(item => item.type || item.section).filter(Boolean))]
      const courseName = course.name
      const items = data.items.map(item => ({ ...item, onReport: () => reportDeadLink(courseName, item) }))
      this.setData({ course, resources: items, visibleResources: items, types, type: '全部', loading: false })
      wx.setNavigationBarTitle({ title: course.name })
      this.refreshFavorite()
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
  async refreshFavorite() {
    if (!auth.getToken()) { this.setData({ favorite: false }); return }
    try {
      const data = await auth.authedGet('/me/favorites', { page: 1, page_size: 100 })
      this.setData({ favorite: data.items.some(item => item.course_id === this.data.id) })
    } catch { this.setData({ favorite: false }) }
  },
  async toggleFavorite() {
    try {
      await auth.ensureLogin()
      if (this.data.favorite) await auth.authedDelete(`/favorites/${encodeURIComponent(this.data.id)}`)
      else await auth.authedPost('/favorites', { course_id: this.data.id })
      this.setData({ favorite: !this.data.favorite })
      wx.showToast({ title: this.data.favorite ? '已收藏' : '已取消', icon: 'success' })
    } catch (error) { wx.showToast({ title: error.message || '操作失败', icon: 'none' }) }
  },
  submitResource() { wx.showToast({ title: '资料投稿功能建设中', icon: 'none' }) }
})