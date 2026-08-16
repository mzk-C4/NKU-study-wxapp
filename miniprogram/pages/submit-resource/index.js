Page({
  data: { loading: false },
  openWebsiteHelp() {
    wx.showModal({ title: '资料投稿建设中', content: '登录和投稿接口尚未开放。现阶段请通过 NKUStudy 网站联系管理人员提交资料。', showCancel: false })
  }
})
