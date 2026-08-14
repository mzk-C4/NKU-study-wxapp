const api = require('../../utils/request')

Page({
  data: { loading: true, error: '', guides: [], visibleGuides: [], categories: ['全部', '选课流程', '培养方案', '退补选', '考试成绩'], category: '全部' },
  onLoad() { this.loadGuides() },
  async loadGuides() {
    this.setData({ loading: true, error: '' })
    try { const data = await api.get('/guides'); this.setData({ guides: data.items, visibleGuides: data.items, loading: false }) }
    catch (error) { this.setData({ loading: false, error: error.message }) }
  },
  chooseCategory(event) { const category = event.currentTarget.dataset.category; this.setData({ category, visibleGuides: category === '全部' ? this.data.guides : this.data.guides.filter(item => item.category === category) }) },
  openGuide(event) { wx.navigateTo({ url: `/pages/guide-detail/index?id=${event.currentTarget.dataset.id}` }) }
})
