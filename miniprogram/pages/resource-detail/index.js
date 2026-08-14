const api = require('../../utils/request')

Page({
  data: { id: '', loading: true, error: '', resource: null },
  onLoad(options) { this.setData({ id: options.id || '' }); this.loadResource() },
  async loadResource() {
    this.setData({ loading: true, error: '' })
    try { const resource = await api.get(`/resources/${this.data.id}`); this.setData({ resource, loading: false }); wx.setNavigationBarTitle({ title: '资料详情' }) }
    catch (error) { this.setData({ loading: false, error: error.message }) }
  },
  copyLink() {
    const { share_url, extraction_code } = this.data.resource
    const text = extraction_code ? `${share_url}\n提取码：${extraction_code}` : share_url
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '链接已复制' }) })
  },
  async reportInvalid() {
    try { await getApp().ensureLogin(); await api.post(`/resources/${this.data.id}/reports`, { reason: 'link_invalid' }); wx.showToast({ title: '已提交反馈' }) }
    catch (error) { wx.showToast({ title: error.message, icon: 'none' }) }
  },
  openCourse() { wx.navigateTo({ url: `/pages/course-resources/index?id=${this.data.resource.course_id}` }) }
})
