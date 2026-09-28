const { reportVisit, getVisitStats } = require('../../utils/visit-report')
const { buildSiteStatus } = require('../../utils/site-status')
const theme = require('../../utils/theme')
const { publicApi } = require('../../services/public-api')
const navigation = require('../../utils/navigation')
const { HOME_SLIDES } = require('../../features/home-carousel')
const { announcementView, createAnnouncementReader } = require('../../features/home-announcement')

Page({
  data: {
    loading: true,
    error: '',
    home: null,
    siteStatus: null,
    slides: HOME_SLIDES,
    currentSlide: 0,
    carouselVisible: false,
    carouselPaused: false,
    carouselTouching: false,
    failedImages: {},
    latestUpdates: [],
    announcement: null,
    announcementOpen: false,
    collaborators: [
      { id: 'mzk', name: '马兆坤', identity: '2512538', account: 'M_zepher_king' },
      { id: 'nkulife', name: '南开指南针', identity: 'nkulife_', account: 'guideNO1' },
      { id: 'shview', name: 'Shview', identity: '', account: 'sh465431276adas@outlook.com' },
      { id: 'hxr', name: '洪修睿', identity: '2513326', account: 'Code-your-Adm' },
      { id: 'dyx', name: '丁宇鑫', identity: '2512100', account: 'wenjiandehuayecai' },
      { id: 'k', name: 'K', identity: '2511144', account: 'qklzhenhc@icloud.com' },
      { id: 'cure', name: 'cure', identity: 'nkuwiki合作方', account: '' },
      { id: 'wsy', name: '王绅右', identity: '2513137', account: 'yhqkwxs' }
    ]
  },

  onLoad() {
    this.announcementReader = createAnnouncementReader(wx)
    this.homeStarted = true
    this.loadSiteStatus(reportVisit('/mp/home'), true)
    this.loadHome()
  },
  onShow() {
    theme.onPageShow()
    this.setData({ carouselVisible: true })
    this.refreshSiteStatus()
    if (this.homeStarted && !this.homeRequest) this.loadHome(true)
  },
  onHide() { this.setData({ carouselVisible: false, carouselTouching: false }) },
  onUnload() { this.unloaded = true; this.setData({ carouselVisible: false }) },
  onPullDownRefresh() {
    this.loadSiteStatus(getVisitStats())
    this.loadHome().finally(() => wx.stopPullDownRefresh())
  },

  async loadSiteStatus(statsPromise, fallbackToRead = false) {
    try {
      let stats = await statsPromise
      if (!stats && fallbackToRead) stats = await getVisitStats()
      const siteStatus = buildSiteStatus(stats)
      if (!siteStatus) return
      this.siteStats = stats
      this.setData({ siteStatus })
    } catch (_) {
      // 状态栏失败不影响主页内容和访问。
    }
  },

  refreshSiteStatus() {
    const siteStatus = buildSiteStatus(this.siteStats)
    if (siteStatus) this.setData({ siteStatus })
  },

  loadHome(silent = false) {
    if (this.homeRequest) return this.homeRequest
    if (silent !== true || !this.data.home) this.setData({ loading: true, error: '' })
    this.homeRequest = (async () => { try {
      const home = await publicApi.getHome()
      if (this.unloaded) return
      const announcement = announcementView(home.announcement)
      const unread = this.announcementReader && this.announcementReader.isUnread(announcement)
      this.setData({ home, announcement, announcementOpen: Boolean(announcement && (this.data.announcementOpen || unread)), latestUpdates: this.buildUpdates(home.latest_updates), loading: false, error: '' })
    } catch (error) {
      if (!this.unloaded && (silent !== true || !this.data.home)) this.setData({ loading: false, error: error.message })
    } finally { this.homeRequest = null } })()
    return this.homeRequest
  },

  openAnnouncement() { if (this.data.announcement) this.setData({ announcementOpen: true }) },
  closeAnnouncement() {
    if (this.announcementReader) this.announcementReader.dismiss(this.data.announcement)
    this.setData({ announcementOpen: false })
  },
  openNkuCs() { wx.navigateTo({ url: '/pages/nkucs-web/index' }) },
  noop() {},

  // 把多行简介整理为「引导语 + 分点要点」：带序号或圆点开头的行进入要点，其余按顺序归入引导语或上一个要点
  buildUpdates(items) {
    const POINT_PATTERN = /^([-*•]|(\d+[.、)]))\s*(.+)$/
    return (items || []).map(item => {
      const lines = String(item.summary || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
      const lead = []
      const points = []
      for (const line of lines) {
        const match = POINT_PATTERN.exec(line)
        if (match) {
          points.push({ text: match[3] })
        } else if (points.length) {
          points[points.length - 1].text += line
        } else {
          lead.push(line)
        }
      }
      return {
        id: item.id,
        title: item.title,
        updated: item.updated,
        lead: lead.join(' '),
        points: points.map((point, index) => ({ id: index, text: point.text })),
        hasPoints: points.length > 0
      }
    })
  },

  openSearch() { navigation.openSearch() },
  changeSlide(event) {
    const currentSlide = Number(event.detail.current)
    if (Number.isInteger(currentSlide) && currentSlide >= 0 && currentSlide < this.data.slides.length) this.setData({ currentSlide })
  },
  toggleCarousel() { this.setData({ carouselPaused: !this.data.carouselPaused }) },
  startCarouselTouch() { this.setData({ carouselTouching: true }) },
  endCarouselTouch() { this.setData({ carouselTouching: false }) },
  bannerImageError(event) {
    const id = event.currentTarget.dataset.id
    if (HOME_SLIDES.some(slide => slide.id === id)) this.setData({ failedImages: { ...this.data.failedImages, [id]: true } })
  },
  openSlide(event) {
    const slide = HOME_SLIDES.find(item => item.id === event.currentTarget.dataset.id)
    if (slide) {
      if (slide.kind === 'page') wx.navigateTo({ url: slide.url })
      else wx.switchTab({ url: slide.url })
    }
  },
  openFeishuDocument() { wx.navigateTo({ url: '/pages/feishu-document/index' }) },
  openUpdate(event) {
    const id = event.currentTarget.dataset.id
    if (id) navigation.openCourse(id)
  },
  openPage(event) {
    const url = event.currentTarget.dataset.url
    if (url.startsWith('/pages/courses') || url.startsWith('/pages/guides')) wx.switchTab({ url })
    else wx.navigateTo({ url })
  }
})
