const MODE_KEY = 'nkustudy_guide_assistant_mode'

function environment() {
  try { return wx.getAccountInfoSync().miniProgram.envVersion } catch (_) { return '' }
}

function isMock() {
  if (environment() !== 'develop') return false
  try { return wx.getStorageSync(MODE_KEY) === 'mock' } catch (_) { return false }
}

module.exports = { MODE_KEY, environment, isMock }
