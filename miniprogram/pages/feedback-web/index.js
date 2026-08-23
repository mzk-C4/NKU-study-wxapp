const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')

Page({
    onShow() { theme.onPageShow() },
  data: { url: 'https://nkustudy.top/feedback' },
  onLoad() { reportVisit('/mp/feedback-web') }
})