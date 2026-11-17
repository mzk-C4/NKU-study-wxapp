const { registerPage: registerThemedPage } = require('../../utils/theme')
const theme = require('../../utils/theme')
const { loadChapters, CHAPTER_ID } = require('../../features/learning-compass/cpp-notes')
const DOCUMENT_URL = 'https://nankai.feishu.cn/wiki/O36Dw5fQVibzsnkx4ptcZreDnAf'
const HANDBOOK = Object.freeze({ title: 'NKU 计网 软件 人智大类生存手册', url: DOCUMENT_URL })
const CPP_NOTES = Object.freeze({ title: 'C++ 笔记', url: 'https://nankai.feishu.cn/wiki/Cve2wGjESikMqrkMY7bcEbqgned' })
// Only a fixed document key can select a destination; query URLs/titles are ignored.
function documentInfo(key) { return key === 'cpp-notes' ? CPP_NOTES : HANDBOOK }

registerThemedPage({
  data: { documentKey: 'handbook', documentTitle: HANDBOOK.title, documentUrl: DOCUMENT_URL, copying: false, copied: false, copyError: '', chapters: [], chapterLoading: false, chapterError: '' },
  onLoad(options = {}) {
    const documentKey = options.doc === 'cpp-notes' ? 'cpp-notes' : 'handbook'
    const document = documentInfo(documentKey)
    this.setData({ documentKey, documentTitle: document.title, documentUrl: document.url, localCppPreview: documentKey === 'cpp-notes' && require('../../features/learning-compass/cpp-preview').enabled() })
    if (typeof wx.setNavigationBarTitle === 'function') wx.setNavigationBarTitle({ title: document.title })
    if (documentKey === 'cpp-notes') this.loadChapters()
  },
  onUnload() { this._unloaded = true },
  async loadChapters() {
    if (this.data.chapterLoading) return
    this.setData({ chapterLoading: true, chapterError: '' })
    try {
      const chapters = await loadChapters()
      if (!this._unloaded) this.setData({ chapters, chapterLoading: false })
    } catch (_) {
      if (!this._unloaded) this.setData({ chapterLoading: false, chapterError: '章节加载失败，请重试。' })
    }
  },
  openChapter(event) {
    const id = event.currentTarget.dataset.id
    if (CHAPTER_ID.test(id) && this.data.chapters.some(chapter => chapter.id === id)) wx.navigateTo({ url: '/pages/guide-detail/index?id=' + encodeURIComponent(id) })
  },
  onShow() { },
  copyLink() {
    if (this.data.copying) return
    this.setData({ copying: true, copied: false, copyError: '' })
    // 固定用户提供的原文地址；不接受页面参数覆盖，不获取或镜像私有正文。
    wx.setClipboardData({
      data: documentInfo(this.data.documentKey).url,
      success: () => this.setData({ copied: true }),
      fail: () => this.setData({ copyError: '复制失败，请重试，或长按上方链接手动复制。' }),
      complete: () => this.setData({ copying: false })
    })
  }
})
