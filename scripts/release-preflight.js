const config = require('../miniprogram/config')

const baseUrl = (process.env.NKUSTUDY_API_BASE_URL || config.resolveApiBaseUrl('trial')).replace(/\/$/, '')

async function main() {
  const url = new URL(`${baseUrl}/home`)
  if (url.protocol !== 'https:') {
    throw new Error(`体验版 API 必须使用 HTTPS：${baseUrl}`)
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!response.ok) {
    throw new Error(`生产 API 健康检查失败：GET ${url} 返回 HTTP ${response.status}`)
  }

  const payload = await response.json()
  if (payload?.code !== 0 || payload.data == null) {
    throw new Error(`生产 API 响应不符合约定：GET ${url} 应返回 { code: 0, data: ... }`)
  }

  console.log(`生产 API 检查通过：${url}`)
}

main().catch(error => {
  const cause = error.cause?.message ? `：${error.cause.message}` : ''
  console.error(`${error.message}${cause}`)
  process.exit(1)
})
