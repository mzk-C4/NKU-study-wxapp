const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const publicApi = require('../../services/public-api')
const navigation = require('../../utils/navigation')

const CATEGORY_LABELS = Object.freeze({
  'course-selection': '选课流程',
  'training-program': '培养方案',
  'add-drop': '退补选',
  'exam-grade': '考试成绩'
})

function normalizeGuideId(value) {
  const id = typeof value === 'string' ? value.trim() : ''
  if (!id || id.length > 200 || /[\s\\\u0000-\u001f\u007f]/.test(id)) return ''
  return id
}

function presentGuide(guide) {
  return {
    onShow() { theme.onPageShow() },
    ...guide,
    category_label: CATEGORY_LABELS[guide.category] || '学习事务',
    updated_label: guide.updated_at || '未提供',
    applicable_scope_label: guide.applicable_scope || '未注明'
  }
}

function userErrorMessage(error) {
  if (error && (error.code === 'NETWORK_ERROR' || error.kind === 'network_error')) {
    return '网络连接失败，请检查网络后重试。'
  }
  return '暂时无法加载指南详情，请稍后重试。'
}

function copyLink(url, successTitle) {
  if (!url) return Promise.resolve(false)
  return new Promise(resolve => {
    wx.setClipboardData({
      data: url,
      success() {
        wx.showToast({ title: successTitle, icon: 'success' })
        resolve(true)
      },
      fail() {
        wx.showToast({ title: '复制失败，请稍后重试。', icon: 'none' })
        resolve(false)
      }
    })
  })
}

Page({
  data: {
    id: '',
    loading: true,
    error: '',
    unavailable: false,
    guide: null
  },

  onLoad(options = {}) { reportVisit('/mp/guide-detail');
    this._isUnloaded = false
    this._requestId = 0
    const id = normalizeGuideId(options.id || options.guideId)
    if (!id) {
      this.setData({ id: '', loading: false, error: '指南编号无效，请返回列表后重试。', unavailable: false, guide: null })
      return Promise.resolve()
    }
    this.setData({ id })
    return this.loadGuide()
  },
  onUnload() {
    this._isUnloaded = true
    this._requestId = (this._requestId || 0) + 1
  },

  retry() {
    return this.loadGuide()
  },

  async loadGuide() {
    if (this._isUnloaded) return
    const id = normalizeGuideId(this.data.id)
    if (!id) {
      this.setData({ loading: false, error: '指南编号无效，请返回列表后重试。', unavailable: false, guide: null })
      return
    }
    const requestId = (this._requestId || 0) + 1
    this._requestId = requestId
    this.setData({ loading: true, error: '', unavailable: false, guide: null })
    try {
      const rawGuide = await publicApi.getGuide(id)
      if (this._isUnloaded || this._requestId !== requestId) return
      if (!rawGuide || !rawGuide.id || !rawGuide.title) {
        this.setData({ loading: false, error: '', unavailable: true, guide: null })
        return
      }
      const guide = presentGuide(rawGuide)
      this.setData({ loading: false, error: '', unavailable: false, guide })
      if (typeof wx.setNavigationBarTitle === 'function') wx.setNavigationBarTitle({ title: guide.title })
    } catch (error) {
      if (this._isUnloaded || this._requestId !== requestId) return
      if (error && (error.statusCode === 404 || error.code === 'GUIDE_NOT_FOUND')) {
        this.setData({ loading: false, error: '', unavailable: true, guide: null })
        return
      }
      this.setData({ loading: false, error: userErrorMessage(error), unavailable: false, guide: null })
    }
  },

  openRelatedCourse(event) {
    const id = event && event.currentTarget && event.currentTarget.dataset.id
    if (id) navigation.openCourse(id)
  },
  copySourceUrl() {
    return copyLink(this.data.guide && this.data.guide.source_url, '来源链接已复制')
  },
  copyCorrectionUrl() {
    return copyLink(this.data.guide && this.data.guide.correction_url, '纠错链接已复制')
  }
})