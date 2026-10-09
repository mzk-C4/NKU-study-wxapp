const HINKU_APP_ID = 'wxbd7dc59babb6d536'
let opening = false

function openHinku() {
  if (opening) return
  if (typeof wx.navigateToMiniProgram !== 'function') {
    wx.showToast({ title: '请更新微信后打开 hinku', icon: 'none' })
    return
  }
  opening = true
  wx.navigateToMiniProgram({
    appId: HINKU_APP_ID,
    envVersion: 'release',
    // 对方尚未提供功能页路径，省略 path 打开首页。
    fail(error) {
      if (/cancel|user deny/i.test(String(error && error.errMsg || ''))) return
      wx.showToast({ title: '暂时无法打开 hinku，请稍后重试', icon: 'none' })
    },
    complete() { opening = false }
  })
}

module.exports = { openHinku }
