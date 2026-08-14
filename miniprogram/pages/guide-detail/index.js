const api = require('../../utils/request')
const navigation = require('../../utils/navigation')

Page({
  data: { id: '', loading: true, error: '', guide: null },
  onLoad(options) { this.setData({ id: options.id || '' }); this.loadGuide() },
  async loadGuide() {
    this.setData({ loading: true, error: '' })
    try { const guide = await api.get(`/guides/${this.data.id}`); this.setData({ guide, loading: false }); wx.setNavigationBarTitle({ title: guide.title }) }
    catch (error) { this.setData({ loading: false, error: error.message }) }
  },
  openCourse(event) { navigation.openCourse(event.currentTarget.dataset.id) },
  reportCorrection() { wx.showModal({ title: '内容纠错', content: '请在“我的—意见反馈”中注明指南标题与需要修正的位置。', showCancel: false }) }
})
