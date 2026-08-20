const { reportVisit } = require('../../utils/visit-report')
const { publicApi } = require('../../services/public-api')
const { downloadResource, validDownloadUrl } = require('../../utils/resource-download')

Page({
  data: {
    courseId: '',
    resourceId: '',
    resource: null,
    related: [],
    loading: true,
    error: ''
  },

  onLoad(options) {
    reportVisit('/mp/resource-detail')
    this.setData({
      courseId: options.courseId || '',
      resourceId: options.resourceId || ''
    })
    this.loadDetail()
  },

  async loadDetail() {
    this.setData({ loading: true, error: '' })
    try {
      const data = await publicApi.getCourseResources(this.data.courseId)
      const items = data.items || []
      const resource = items.find(item => item.id === this.data.resourceId)
      if (!resource) {
        this.setData({ loading: false, error: '资源不存在或已被删除' })
        return
      }
      const related = items.filter(item => item.id !== this.data.resourceId).slice(0, 5)
      this.setData({ resource, related, loading: false })
      wx.setNavigationBarTitle({ title: resource.title || '资料详情' })
    } catch (error) {
      this.setData({ loading: false, error: error.message })
    }
  },

  copyLink() {
    const res = this.data.resource
    if (!res || !res.download_url) {
      wx.showToast({ title: '暂无下载链接', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: res.download_url,
      success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
    })
  },

  download() {
    if (this.data.resource) downloadResource(this.data.resource)
  },

  reportExpired() {
    wx.showModal({
      title: '反馈链接失效',
      content: '确认该资源链接已无法访问？我们将记录您的反馈。',
      confirmText: '确认反馈',
      confirmColor: '#4B1F6F',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({ title: '反馈已记录', icon: 'success' })
        }
      }
    })
  },

  openRelated(event) {
    const id = event.currentTarget.dataset.id
    wx.redirectTo({
      url: `/pages/resource-detail/index?courseId=${this.data.courseId}&resourceId=${id}`
    })
  }
})
