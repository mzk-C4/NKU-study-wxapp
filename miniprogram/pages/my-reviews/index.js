const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const { publicApi } = require('../../services/public-api')
const authSession = require('../../utils/auth-session')

const STATUS_LABELS = { approved: '已公开', pending: '审核中', rejected: '未通过', hidden: '已隐藏', needs_changes: '待修改' }

function displayDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

Page({
  data: { loading: true, error: '', reviews: [] },

  onLoad() { reportVisit('/mp/my-reviews') },
  onShow() { theme.onPageShow(); this.load() },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },

  async load() {
    if (!authSession.readSession()) {
      this.setData({ loading: false, error: '', reviews: [] })
      return
    }
    this.setData({ loading: true, error: '' })
    try {
      const result = await publicApi.getMyReviews({ page: 1, page_size: 100 })
      this.setData({
        loading: false,
        reviews: result.items.map(item => {
          const status = item.hidden ? 'hidden' : item.status
          return { ...item, status, status_label: STATUS_LABELS[status] || '状态未知', status_class: `status--${status}`, created_date: displayDate(item.created_at) }
        })
      })
    } catch (error) {
      this.setData({ loading: false, error: error.message || '评价加载失败' })
    }
  },

  retry() { this.load() }
})
