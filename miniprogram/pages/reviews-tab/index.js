const { reportVisit } = require('../../utils/visit-report')
const { publicApi } = require('../../services/public-api')
const navigation = require('../../utils/navigation')

Page({
  data: { loading: true, error: '', groups: [], page: 1, hasMore: false },
  onLoad() { reportVisit('/mp/reviews-tab'); this.loadGroups() },
  onPullDownRefresh() { this.setData({ page: 1 }); this.loadGroups().finally(() => wx.stopPullDownRefresh()) },
  onReachBottom() { if (this.data.hasMore && !this.data.loading) this.loadMore() },
  async loadGroups() {
    this.setData({ loading: true, error: '' })
    try {
      const data = await publicApi.getReviewGroups({ page: 1, page_size: 20 })
      this.setData({ groups: data.items || [], page: 1, hasMore: data.total > 20, loading: false })
    } catch (error) { this.setData({ loading: false, error: error.message }) }
  },
  async loadMore() {
    const next = this.data.page + 1
    try {
      const data = await publicApi.getReviewGroups({ page: next, page_size: 20 })
      this.setData({ groups: [...this.data.groups, ...(data.items || [])], page: next, hasMore: data.total > next * 20 })
    } catch {}
  },
  openGroup(event) {
    const group = event.currentTarget.dataset.group
    const key = group.group_key || group.key
    if (key) wx.navigateTo({ url: `/pages/course-reviews/index?group=${encodeURIComponent(key)}` })
  }
})
