const navigation = require('../../utils/navigation')

Page({
  data: {
    user: null,
    history: [],
    loading: false,
    favoriteLabel: '登录后开放',
    submissionLabel: '登录后开放',
    reviewLabel: '登录后开放'
  },
  onShow() { this.refresh() },
  refresh() { this.setData({ user: null, history: wx.getStorageSync('browse_history') || [] }) },
  login() { wx.showToast({ title: '微信手机号登录功能建设中', icon: 'none' }) },
  unavailable() { wx.showToast({ title: '登录后开放，当前可匿名浏览', icon: 'none' }) },
  openHistory(event) { navigation.openCourse(event.currentTarget.dataset.id) },
  openSubmit() { wx.navigateTo({ url: '/pages/submit-resource/index' }) },
  feedback() { wx.showModal({ title: '意见反馈', content: '请通过项目 GitHub Issues 或 NKUStudy.top 的反馈入口提交。', showCancel: false }) },
  about() { wx.showModal({ title: '关于 NKUStudy', content: '南开学生共建的非官方课程资料与选课参考平台。浏览无需实名。', showCancel: false }) }
})
