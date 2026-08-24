// 真实编译+渲染验证：连接 DevTools 自动化端口，逐页 reLaunch 并检查节点数
const automator = require('miniprogram-automator')

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} 超时(${ms}ms)`)), ms)),
  ])
}

async function step(label, ms, fn) {
  process.stdout.write(`[step] ${label} ... `)
  try {
    const result = await withTimeout(Promise.resolve().then(fn), ms, label)
    console.log('OK')
    return result
  } catch (err) {
    console.log(`FAIL: ${err.message}`)
    throw err
  }
}

const PAGES = [
  '/pages/home/index',
  '/pages/courses/index',
  '/pages/reviews-tab/index',
  '/pages/guides/index',
  '/pages/profile/index',
]

async function main() {
  const miniProgram = await step('连接自动化端口', 15000, () =>
    automator.connect({ wsEndpoint: 'ws://127.0.0.1:9421' }))

  await step('systemInfo', 10000, () => miniProgram.systemInfo())
  await step('currentPage', 10000, () => miniProgram.currentPage())

  let failed = 0
  for (const route of PAGES) {
    try {
      await step(`reLaunch ${route}`, 20000, async () => {
        const page = await miniProgram.reLaunch(route)
        await page.waitFor(600)
        return page
      })
      const current = await step(`查询节点 ${route}`, 10000, () => miniProgram.currentPage().then((p) => p.$$('.page, .profile-page')))
      console.log(`      ${route} -> 渲染 ${current.length} 个顶层节点`)
    } catch (err) {
      failed += 1
      console.log(`FAIL ${route} -> ${err.message}`)
    }
  }

  // profile 页专项：验证密码弹窗 wx:if 独立层级
  try {
    const page = await step('reLaunch profile', 20000, () => miniProgram.reLaunch('/pages/profile/index'))
    await step('读取 page.data', 10000, () => page.data())
    await step('setData passwordModalVisible', 10000, () =>
      page.setData({ passwordModalVisible: true, aboutVisible: false }))
    await page.waitFor(400)
    const masks = await step('查询 about-mask', 10000, () => page.$$('.about-mask'))
    const ok = masks.length === 1
    console.log(`${ok ? 'OK  ' : 'FAIL'} 密码弹窗独立显示：about-mask = ${masks.length}（期望 1）`)
    if (!ok) failed += 1
  } catch (err) {
    failed += 1
    console.log(`FAIL 密码弹窗验证 -> ${err.message}`)
  }

  try { await miniProgram.disconnect() } catch (_) {}
  console.log(failed === 0 ? '\n全部页面真实渲染验证通过' : `\n${failed} 项失败`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('验证中断:', err.message)
  process.exit(1)
})
