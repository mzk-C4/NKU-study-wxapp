// 主题：暂只支持亮色，保留接口供后续启用
const KEY = 'nkustudy_theme_dark'

function isDark() { return false }
function themeClass() { return '' }
function setDark(enabled) {
  if (typeof wx === 'undefined') return
  wx.setStorageSync(KEY, enabled)
}
function onPageShow() { return '' }
function apply() {}

module.exports = { isDark, themeClass, setDark, onPageShow, apply, KEY }
