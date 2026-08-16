const publicApi = require('../../services/public-api')

Page({
  data: {
    id: '', loading: true, error: '', course: null,
    reviews: [], visibleReviews: [], groups: [], groupKey: '',
    reviewEmptyText: '当前没有可展示的公开评价'
  },
  onLoad(options) { this.setData({ id: options.id || '' }); this.loadReviews() },

  async loadReviews() {
    if (!this.data.id) return this.setData({ loading: false, error: '缺少课程编号' })
    this.setData({ loading: true, error: '' })
    try {
      const [course, groupList] = await Promise.all([publicApi.getCourse(this.data.id), publicApi.getReviewGroups()])
      const matchedGroups = groupList.items.filter(item => item.matched && item.course_id === course.id)
      const groupDetails = groupList.available
        ? await Promise.all(matchedGroups.map(item => publicApi.getReviewGroup(item.group_key)))
        : []
      const groups = groupDetails.filter(item => item.matched && item.course_id === course.id)
      const reviews = groups.flatMap(group => group.items)
      this.setData({
        course,
        groups,
        reviews,
        visibleReviews: reviews,
        groupKey: '',
        reviewEmptyText: groupList.available ? '当前没有可展示的公开评价' : '本地参考服务未提供公开评价分组',
        loading: false
      })
      wx.setNavigationBarTitle({ title: course.name })
    } catch (error) { this.setData({ loading: false, error: error.message }) }
  },
  chooseGroup(event) {
    const groupKey = event.currentTarget.dataset.key || ''
    const visibleReviews = groupKey ? this.data.reviews.filter(item => item.group_key === groupKey) : this.data.reviews
    this.setData({ groupKey, visibleReviews })
  },
  writeReview() {
    wx.showModal({ title: '评价提交暂未开放', content: '匿名评价写入仍在完成安全与审核验证，当前不会发送任何提交请求。', showCancel: false })
  },
  reportUnavailable() {
    wx.showModal({ title: '举报暂未开放', content: '功能建设中，暂未连接线上服务。', showCancel: false })
  }
})
