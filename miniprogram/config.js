const API_BASE_URLS = Object.freeze({
  develop: 'http://127.0.0.1:3000/api/v1',
  trial: 'https://nkustudy.top/api/v1',
  release: 'https://nkustudy.top/api/v1'
})

function resolveApiBaseUrl(envVersion = 'develop') {
  return API_BASE_URLS[envVersion] || API_BASE_URLS.develop
}

function getEnvironmentVersion() {
  try {
    if (typeof wx !== 'undefined' && typeof wx.getAccountInfoSync === 'function') {
      return wx.getAccountInfoSync()?.miniProgram?.envVersion || 'develop'
    }
  } catch (_) {
    // 开发者工具初始化早期可能暂时无法读取账号信息，回退到开发环境。
  }
  return 'develop'
}

const envVersion = getEnvironmentVersion()

module.exports = {
  apiBaseUrl: resolveApiBaseUrl(envVersion),
  requestTimeout: 10000,
  envVersion,
  resolveApiBaseUrl
}
