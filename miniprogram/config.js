const API_PROFILE_STORAGE_KEY = 'nkustudy_api_profile'
const API_PROFILES = Object.freeze({
  production: 'https://nkustudy.top/api/v1',
  reference: 'http://127.0.0.1:3000/api/v1'
})

function resolveApiProfile(envVersion, storedProfile) {
  if (envVersion !== 'develop') return 'production'
  return storedProfile === 'reference' ? 'reference' : 'production'
}

function resolveApiBaseUrl(envVersion, storedProfile) {
  return API_PROFILES[resolveApiProfile(envVersion, storedProfile)]
}

function getEnvironmentVersion() {
  try {
    if (typeof wx !== 'undefined' && typeof wx.getAccountInfoSync === 'function') {
      const value = wx.getAccountInfoSync()?.miniProgram?.envVersion
      return ['develop', 'trial', 'release'].includes(value) ? value : ''
    }
  } catch (_) {
    // 读取失败时保持生产 profile；不要把未知运行环境当成本地 reference。
  }
  return ''
}

function getStoredApiProfile(envVersion) {
  if (envVersion !== 'develop') return ''
  try {
    if (typeof wx !== 'undefined' && typeof wx.getStorageSync === 'function') {
      return wx.getStorageSync(API_PROFILE_STORAGE_KEY)
    }
  } catch (_) {
    // 本地设置读取失败时安全回退 production。
  }
  return ''
}

const envVersion = getEnvironmentVersion()
const apiProfile = resolveApiProfile(envVersion, getStoredApiProfile(envVersion))

module.exports = {
  apiBaseUrl: API_PROFILES[apiProfile],
  requestTimeout: 10000,
  envVersion,
  apiProfile,
  API_PROFILE_STORAGE_KEY,
  API_PROFILES,
  resolveApiProfile,
  resolveApiBaseUrl,
  getEnvironmentVersion,
  getStoredApiProfile
}
