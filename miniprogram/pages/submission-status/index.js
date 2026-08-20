const { reportVisit } = require('../../utils/visit-report')

const STATUS_CONFIG = {
  pending: { label: '审核中', tone: 'gold' },
  approved: { label: '已通过', tone: 'green' },
  revision: { label: '需修改', tone: 'purple' },
  rejected: { label: '未通过', tone: 'red' }
}

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '审核中' },
  { key: 'approved', label: '已通过' }
]

Page({
  onLoad() {
    reportVisit('/mp/submission-status')
    this.loadSubmissions()
  },

  data: {
    filter: 'all',
    filters: FILTERS,
    allSubmissions: [],
    visibleSubmissions: [],
    loading: true,
    error: ''
  },

  loadSubmissions() {
    this.setData({ loading: true, error: '' })
    // 投稿接口尚未开放（issue #11），从本地存储读取
    const submissions = (wx.getStorageSync('nkustudy_submissions') || []).map(item => ({
      ...item,
      statusLabel: (STATUS_CONFIG[item.status] || STATUS_CONFIG.pending).label,
      statusTone: (STATUS_CONFIG[item.status] || STATUS_CONFIG.pending).tone
    }))
    this.setData({ allSubmissions: submissions, loading: false })
    this.applyFilter()
  },

  chooseFilter(event) {
    this.setData({ filter: event.currentTarget.dataset.key })
    this.applyFilter()
  },

  applyFilter() {
    const { allSubmissions, filter } = this.data
    const list = filter === 'all' ? allSubmissions : allSubmissions.filter(item => item.status === filter)
    this.setData({ visibleSubmissions: list })
  },

  editSubmission(event) {
    wx.navigateTo({ url: '/pages/submit-resource/index' })
  }
})
