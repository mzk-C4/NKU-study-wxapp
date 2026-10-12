// One device-local preference for every native page; external readers keep theirs.
const KEY = 'nkustudy_theme_dark'
const DARK = {
  bg: '#19161E', surface: '#24202B', soft: '#302839', line: '#514659',
  text: '#F0EAF5', muted: '#BEB3C8', accent: '#D2AEF2', primary: '#704494',
  gold: '#E8C984', 'gold-soft': '#382F22', green: '#8DD5B0', 'green-soft': '#21392F',
  blue: '#9CC8F0', 'blue-soft': '#233344', red: '#FFADB3', 'red-soft': '#40282F'
}
const TAB_ICONS = ['home', 'courses', 'reviews', 'guides', 'profile']

function isDark() {
  try { return typeof wx !== 'undefined' && wx.getStorageSync(KEY) === true } catch (_) { return false }
}
function themeClass() { return isDark() ? 'theme-dark' : 'theme-light' }
function view(dark = isDark()) {
  const background = dark ? DARK.bg : '#F6F3F7'
  // Reset variables on return to light, preserving original CSS fallbacks.
  // Page variables also inherit through custom component style isolation.
  const variables = Object.keys(DARK).map(key => `--nk-${key}:${dark ? DARK[key] : 'initial'}`).join(';')
  return {
    themeDark: dark, themeLabel: dark ? '深色' : '浅色',
    themePageStyle: `${variables};background-color:${background};color:${dark ? DARK.text : '#211C24'}`,
    themeBackground: background, themeNavigation: dark ? DARK.surface : '#FFFDF8',
    themeFront: dark ? '#ffffff' : '#000000', themeLoading: dark ? 'light' : 'dark',
    themeControlColor: dark ? DARK.primary : '#4B1F6F'
  }
}
function call(name, options) {
  if (typeof wx === 'undefined' || typeof wx[name] !== 'function') return
  try { wx[name]({ ...options, fail() {} }) } catch (_) { /* Older base libraries may lack UI APIs. */ }
}
function apply(page) {
  const state = view()
  if (page && typeof page.setData === 'function') page.setData(state)
  call('setNavigationBarColor', { frontColor: state.themeFront, backgroundColor: state.themeNavigation })
  call('setBackgroundColor', { backgroundColor: state.themeBackground, backgroundColorTop: state.themeBackground, backgroundColorBottom: state.themeBackground })
  call('setBackgroundTextStyle', { textStyle: state.themeLoading })
  call('setTabBarStyle', { color: state.themeDark ? '#BEB3C8' : '#817A84', selectedColor: state.themeDark ? DARK.accent : '#4B1F6F', backgroundColor: state.themeNavigation, borderStyle: state.themeDark ? 'black' : 'white' })
  TAB_ICONS.forEach((name, index) => call('setTabBarItem', {
    index, iconPath: `assets/tab/${name}.png`,
    // Purple selected icons disappear on dark surfaces: keep the neutral icon
    // there and distinguish selection with the lavender label.
    selectedIconPath: `assets/tab/${name}${state.themeDark ? '' : '-active'}.png`
  }))
  return state
}
function setDark(enabled, page) {
  if (typeof enabled !== 'boolean') return false
  try { wx.setStorageSync(KEY, enabled) } catch (_) {
    call('showToast', { title: '主题保存失败，请重试', icon: 'none' })
    return false
  }
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  const state = view(enabled)
  pages.forEach(item => { if (item !== page && typeof item.setData === 'function') item.setData(state) })
  apply(page || pages[pages.length - 1])
  return true
}
function onPageShow() { return apply() }
function withTheme(definition) {
  const result = { ...definition, data: { ...definition.data, ...view() } }
  ;['onLoad', 'onShow'].forEach(name => {
    result[name] = function (...args) {
      apply(this)
      return typeof definition[name] === 'function' ? definition[name].apply(this, args) : undefined
    }
  })
  return result
}
function registerPage(definition) { return Page(withTheme(definition)) }
module.exports = { KEY, DARK, isDark, themeClass, view, setDark, onPageShow, apply, withTheme, registerPage }
