// Public map entry is enabled for every build; publishing still needs a new package.
const config = {
  enabled: true,
  developEnabled: true,
  origin: 'https://nkustudy.top',
  path: '/campus-map/'
}

config.isEnabled = function () {
  if (config.enabled) return true
  if (!config.developEnabled) return false
  try {
    const account = wx.getAccountInfoSync()
    return account.miniProgram.envVersion === 'develop'
  } catch (_) {
    return false
  }
}

module.exports = config
