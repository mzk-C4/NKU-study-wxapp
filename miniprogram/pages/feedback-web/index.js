const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')

Page({
  data: { url: 'https://nkustudy.top/feedback' },
  onLoad() { reportVisit('/mp/feedback-web') }
})