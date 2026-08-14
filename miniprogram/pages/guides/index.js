Page({
  data: { loading: false },
  openWebsite() {
    wx.showModal({ title: '选课指南建设中', content: '小程序指南接口尚未开放。当前请以教务系统通知和 NKUStudy 网站内容为准。', showCancel: false })
  }
})
