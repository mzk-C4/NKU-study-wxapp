// 主题管理：手动开关覆盖系统暗色
const KEY = 'nkustudy_theme' // 'light' | 'dark' | '' (跟随系统)

function getTheme() {
  if (typeof wx === 'undefined') return ''
  return wx.getStorageSync(KEY) || ''
}

function isDark() {
  const t = getTheme()
  if (t === 'dark') return true
  if (t === 'light') return false
  try {
    const sys = wx.getSystemInfoSync()
    return sys.theme === 'dark'
  } catch { return false }
}

function setTheme(theme) {
  wx.setStorageSync(KEY, theme)
  applyTheme()
}

function applyTheme() {
  if (typeof wx === 'undefined' || !wx.setTabBarStyle) return false
  const dark = isDark()
  // tabBar
  wx.setTabBarStyle({
    backgroundColor: dark ? '#1A1520' : '#FFFDF8',
    color: dark ? '#8B8090' : '#817A84',
    selectedColor: dark ? '#E8CF96' : '#4B1F6F',
    borderStyle: dark ? 'black' : 'white'
  })
  // 导航栏
  wx.setNavigationBarColor({
    frontColor: dark ? '#ffffff' : '#000000',
    backgroundColor: dark ? '#1A1520' : '#FFFDF8'
  })
  // 背景
  wx.setBackgroundColor({
    backgroundColor: dark ? '#1A1520' : '#F6F3F7',
    backgroundColorTop: dark ? '#1A1520' : '#F6F3F7',
    backgroundColorBottom: dark ? '#1A1520' : '#F6F3F7'
  })
  return dark
}

// 每个页面 onShow 调用
function onPageShow() {
  return applyTheme()
}

module.exports = { getTheme, isDark, setTheme, applyTheme, onPageShow, KEY }
