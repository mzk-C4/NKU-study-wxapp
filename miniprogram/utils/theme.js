// 主题管理：支持三种模式 'light' | 'dark' | '' (跟随系统)
const KEY = 'nkustudy_theme'

function getTheme() {
  if (typeof wx === 'undefined') return ''
  try { return wx.getStorageSync(KEY) || '' } catch { return '' }
}

function systemIsDark() {
  if (typeof wx === 'undefined') return false
  try {
    const sys = wx.getSystemInfoSync()
    return sys.theme === 'dark'
  } catch { return false }
}

function isDark() {
  const t = getTheme()
  if (t === 'dark') return true
  if (t === 'light') return false
  return systemIsDark()
}

function themeClass() {
  const t = getTheme()
  if (t === 'dark') return 'theme-force-dark'
  if (t === 'light') return 'theme-force-light'
  return ''
}

function setTheme(theme) {
  if (typeof wx === 'undefined') return
  wx.setStorageSync(KEY, theme)
  applyTheme()
}

function applyTheme() {
  if (typeof wx === 'undefined' || !wx.setTabBarStyle) return false
  const dark = isDark()
  try { wx.setTabBarStyle({ backgroundColor: dark ? '#1A1520' : '#FFFDF8', color: dark ? '#8B8090' : '#817A84', selectedColor: dark ? '#E8CF96' : '#4B1F6F', borderStyle: dark ? 'black' : 'white' }) } catch {}
  try { wx.setNavigationBarColor({ frontColor: dark ? '#ffffff' : '#000000', backgroundColor: dark ? '#1A1520' : '#FFFDF8' }) } catch {}
  try { wx.setBackgroundColor({ backgroundColor: dark ? '#1A1520' : '#F6F3F7', backgroundColorTop: dark ? '#1A1520' : '#F6F3F7', backgroundColorBottom: dark ? '#1A1520' : '#F6F3F7' }) } catch {}
  return dark
}

function onPageShow() {
  applyTheme()
  return themeClass()
}

module.exports = { getTheme, isDark, themeClass, setTheme, applyTheme, onPageShow, KEY }
