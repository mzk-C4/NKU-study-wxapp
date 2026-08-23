const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const { publicApi } = require('../../services/public-api')
const navigation = require('../../utils/navigation')

Page({
  data: {
 loading: true, error: '', groups: [], page: 1, hasMore: false },
  onLoad() { reportVisit('/mp/reviews-tab'); this.loadGroups() },
    onShow() { theme.onPageShow() },
  onPullDownRefresh() { this.setData({ page: 1 }); this.loadGroups().finally(() => wx.stopPullDownRefresh()) },
  onReachBottom() {},
  async loadGroups() {
    this.setData({ loading: true, error: '' })
    try {
      const data = await publicApi.getReviewGroups()
      const groups = Array.isArray(data) ? data : (data.items || [])
      this.setData({ groups, page: 1, hasMore: false, loading: false })
    } catch (error) { this.setData({ loading: false, error: error.message }) }
  },
  async loadMore() {
    const next = this.data.page + 1
    try {
      // team API returns all groups at once, no pagination needed
    } catch {}
  },
  openGroup(event) {
    const group = event.currentTarget.dataset.group
    const key = group.group_key || group.key
    if (key) wx.navigateTo({ url: `/pages/course-reviews/index?group_key=${encodeURIComponent(key)}` })
  }
})