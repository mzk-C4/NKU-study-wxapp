const navigation = require('../../utils/navigation')

Page({
  data: { history: [] },
  onShow() { this.setData({ history: wx.getStorageSync('browse_history') || [] }) },
  showUnavailable() {
    wx.showModal({ title: '功能建设中', content: '登录、收藏、投稿和个人数据暂未连接线上服务。', showCancel: false })
  },
  openHistory(event) { navigation.openCourse(event.currentTarget.dataset.id) },
  feedback() { wx.showModal({ title: '意见反馈', content: '请通过项目 GitHub Issues 或 NKUStudy.top 的反馈入口提交。', showCancel: false }) },
  about() { wx.showModal({ title: '关于 NKUStudy', content: '南开学生共建的非官方课程资料与选课参考平台。', showCancel: false }) }
})
