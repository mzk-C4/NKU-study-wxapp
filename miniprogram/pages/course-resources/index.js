const publicApi = require('../../services/public-api')

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success(result) {
        if (result.statusCode === 200 && result.tempFilePath) resolve(result.tempFilePath)
        else reject(new Error('资料下载未完成，请稍后重试。'))
      },
      fail() { reject(new Error('资料下载失败，请稍后重试。')) }
    })
  })
}

function openDocument(filePath) {
  return new Promise((resolve, reject) => {
    wx.openDocument({
      filePath,
      showMenu: true,
      success: resolve,
      fail() { reject(new Error('文件已下载，但暂时无法打开。')) }
    })
  })
}

Page({
  data: { id: '', loading: true, error: '', course: null, resources: [], visibleResources: [], types: ['全部'], type: '全部', downloadingId: '' },
  onLoad(options) { this.setData({ id: options.id || '' }); this.loadResources() },

  async loadResources() {
    if (!this.data.id) return this.setData({ loading: false, error: '缺少课程编号' })
    this.setData({ loading: true, error: '' })
    try {
      const [course, data] = await Promise.all([publicApi.getCourse(this.data.id), publicApi.getCourseResources(this.data.id)])
      const types = ['全部', ...new Set(data.items.map(item => item.type).filter(Boolean))]
      this.setData({ course, resources: data.items, visibleResources: data.items, types, type: '全部', loading: false })
      wx.setNavigationBarTitle({ title: course.name })
    } catch (error) { this.setData({ loading: false, error: error.message }) }
  },
  chooseType(event) {
    const type = event.currentTarget.dataset.type
    const visibleResources = type === '全部' ? this.data.resources : this.data.resources.filter(item => item.type === type)
    this.setData({ type, visibleResources })
  },
  async openResource(event) {
    const resource = this.data.resources.find(item => item.id === event.currentTarget.dataset.id)
    if (!resource || !resource.download_available || !publicApi.isAllowedResourceDownloadUrl(resource.download_url)) {
      wx.showModal({ title: '暂时无法下载', content: '该资料没有可用的安全下载地址，请稍后再试。', showCancel: false })
      return
    }
    if (this.data.downloadingId) {
      wx.showToast({
        title: this.data.downloadingId === resource.id ? '该资料正在下载' : '已有资料正在下载',
        icon: 'none'
      })
      return
    }
    this.setData({ downloadingId: resource.id })
    let downloaded = false
    try {
      const filePath = await downloadFile(resource.download_url)
      downloaded = true
      await openDocument(filePath)
    } catch (error) {
      wx.showModal({
        title: downloaded ? '暂时无法打开' : '暂时无法下载',
        content: downloaded ? '文件已下载，但暂时无法打开，请稍后重试。' : '资料下载失败，请稍后重试。',
        showCancel: false
      })
    } finally {
      this.setData({ downloadingId: '' })
    }
  },
  submitResource() {
    wx.showModal({ title: '资料投稿暂未开放', content: '功能建设中，暂未连接线上服务。', showCancel: false })
  }
})
