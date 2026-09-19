const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const { parseMarkdown } = require('../../utils/markdown')
const { publicApi } = require('../../services/public-api')

// 与网页关于页同源（GET /api/v1/about），后台"关于页面管理"改一次两边同步
Page({
  data: {
    loading: true,
    error: '',
    title: '关于',
    blocks: []
  },

  onLoad() {
    reportVisit('/mp/about')
    this.loadAbout()
  },
  onShow() { theme.onPageShow() },
  onPullDownRefresh() {
    this.loadAbout().finally(() => wx.stopPullDownRefresh())
  },

  async loadAbout() {
    this.setData({ loading: true, error: '' })
    try {
      const data = await publicApi.getAbout()
      const blocks = parseMarkdown(String(data.content || ''))
      this.setData({
        loading: false,
        title: data.title || '关于',
        blocks
      })
      wx.setNavigationBarTitle({ title: data.title || '关于' })
    } catch (error) {
      this.setData({ loading: false, error: error.message || '关于页加载失败' })
    }
  },

  openMarkdownLink(event) {
    const href = String(event.currentTarget.dataset.href || '')
    if (!href) return
    if (href.includes('nkustudy.top/feedback')) {
      wx.navigateTo({ url: '/pages/feedback/index' })
      return
    }
    wx.setClipboardData({ data: href, success: () => wx.showToast({ title: '链接已复制', icon: 'none' }) })
  }
})
