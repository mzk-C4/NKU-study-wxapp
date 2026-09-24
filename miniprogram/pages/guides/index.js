const navigation = require('../../utils/navigation')
const learningProfile = require('../../utils/learning-profile')
const { TOPICS } = require('../../features/learning-compass/catalog')
const { PDF_DOCUMENTS } = require('../../features/learning-compass/documents')

Page({
  data: {
    homeCategories: TOPICS, activeHomeCategory: '', pdfCount: PDF_DOCUMENTS.length,
    guideContextLabel: learningProfile.formatLabel(learningProfile.emptyProfile())
  },
  onLoad() { this._isUnloaded = false; this.refreshLearningProfile() },
  onShow() { this.refreshLearningProfile() },
  onUnload() { this._isUnloaded = true },
  refreshLearningProfile() {
    if (!this._isUnloaded) this.setData({ guideContextLabel: learningProfile.formatLabel(learningProfile.read()) })
  },
  openSearch() { navigation.openGuideSearch() },
  openDocuments() { navigation.openGuideDocuments() },
  openHomeCategory(event) {
    const value = event.currentTarget.dataset.value
    if (!TOPICS.some(item => item.value === value)) return
    this.setData({ activeHomeCategory: value })
    navigation.openGuideCategory(value)
  },
  openAssistant() { navigation.openGuideAssistant() }
})
