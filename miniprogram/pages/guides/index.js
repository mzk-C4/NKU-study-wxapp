const { registerPage: registerThemedPage } = require('../../utils/theme')
const navigation = require('../../utils/navigation')
const learningProfile = require('../../utils/learning-profile')
const { TOPICS } = require('../../features/learning-compass/catalog')
const { PDF_DOCUMENTS } = require('../../features/learning-compass/documents')
const { openHinku } = require('../../utils/partner-mini-program')

const ASSISTANT_EXAMPLES = Object.freeze([
  '对课程成绩有异议，如何申请复核？',
  '休学期满后如何申请复学？',
  '本科课程作业中如何规范使用 AI 工具？'
])

registerThemedPage({
  data: {
    homeCategories: TOPICS, activeHomeCategory: '', pdfCount: PDF_DOCUMENTS.length,
    assistantExamples: ASSISTANT_EXAMPLES,
    guideContextLabel: learningProfile.formatLabel(learningProfile.emptyProfile())
  },
  onLoad() { this._isUnloaded = false; this.refreshLearningProfile() },
  onShow() { this.refreshLearningProfile() },
  onUnload() { this._isUnloaded = true },
  refreshLearningProfile() {
    if (!this._isUnloaded) this.setData({ guideContextLabel: learningProfile.formatLabel(learningProfile.read()) })
  },
  openCampusMap() { navigation.openCampusMap() },
  openHinku,
  openSearch() { navigation.openGuideSearch() },
  openAssistant() { navigation.openGuideAssistant() },
  openAssistantExample(event) {
    const question = event && event.currentTarget && event.currentTarget.dataset.question
    if (ASSISTANT_EXAMPLES.includes(question)) navigation.openGuideAssistant(question)
  },
  openDocuments() { navigation.openGuideDocuments() },
  openHomeCategory(event) {
    const value = event.currentTarget.dataset.value
    if (!TOPICS.some(item => item.value === value)) return
    this.setData({ activeHomeCategory: value })
    navigation.openGuideCategory(value)
  }
})
