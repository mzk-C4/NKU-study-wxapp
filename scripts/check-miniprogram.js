const fs = require('node:fs')
const path = require('node:path')
const childProcess = require('node:child_process')

const root = path.resolve(__dirname, '..')
const miniRoot = path.join(root, 'miniprogram')
const app = JSON.parse(fs.readFileSync(path.join(miniRoot, 'app.json'), 'utf8'))
const failures = []

function fail(message) { failures.push(message) }
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(target) : [target]
  })
}

function checkComponentReferences(file) {
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const [name, reference] of Object.entries(config.usingComponents || {})) {
    if (reference.startsWith('/')) {
      fail(`组件 ${name} 使用了当前开发者工具无法解析的绝对路径：${path.relative(root, file)} -> ${reference}`)
      continue
    }
    const componentConfig = path.resolve(path.dirname(file), `${reference}.json`)
    if (!fs.existsSync(componentConfig)) {
      fail(`组件配置缺失：${path.relative(root, file)} -> ${path.relative(root, componentConfig)}`)
    }
  }
}

for (const page of app.pages) {
  for (const extension of ['json', 'js', 'wxml', 'wxss']) {
    const file = path.join(miniRoot, `${page}.${extension}`)
    if (!fs.existsSync(file)) fail(`页面文件缺失：${path.relative(root, file)}`)
  }
}

const tabPages = new Set((app.tabBar?.list || []).map(item => item.pagePath))
for (const page of tabPages) if (!app.pages.includes(page)) fail(`TabBar 页面未注册：${page}`)

for (const file of walk(miniRoot)) {
  const relative = path.relative(root, file)
  if (file.endsWith('.json')) checkComponentReferences(file)
  if (file.endsWith('.js')) {
    const result = childProcess.spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    if (result.status !== 0) fail(`JavaScript 语法错误：${relative}\n${result.stderr}`)
  }
  if (file.endsWith('.wxml')) {
    const source = fs.readFileSync(file, 'utf8')
    if (/\.includes\s*\(/.test(source)) fail(`WXML 不支持方法调用：${relative}`)
    if (/wx:for="\{\{\s*\[/.test(source)) fail(`WXML 中不应使用数组字面量：${relative}`)
    if (/wx:key="[^"]*[+][^"]*"/.test(source)) fail(`wx:key 不应使用表达式：${relative}`)
    if (/<br\s*\/?\s*>/i.test(source)) fail(`请用 view 控制换行：${relative}`)
  }
}

const detailTabPages = ['course-overview', 'course-resources', 'course-reviews']
const detailTabComponent = 'components/course-detail-tabs/index'
if (app.usingComponents?.['course-detail-tabs'] !== detailTabComponent) {
  fail(`共享课程详情 Tab 未全局注册：course-detail-tabs -> ${detailTabComponent}`)
}

for (const page of detailTabPages) {
  const pageRoot = path.join(miniRoot, 'pages', page)
  const template = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
  const references = template.match(/<course-detail-tabs(?:\s|>)/g) || []
  if (references.length !== 1) fail(`详情页必须且只能引用一次共享 Tab：pages/${page}/index.wxml`)
}

const detailTabStyleOwner = path.join(miniRoot, 'components/course-detail-tabs/index.wxss')
const detailTabStylePattern = /(^|[},\s])\.(?:detail-tabs|detail-tab|detail-tab--active)(?=[\s,{:#>+~])/m
const detailTabStyleFiles = walk(miniRoot).filter(file => file.endsWith('.wxss') && detailTabStylePattern.test(fs.readFileSync(file, 'utf8')))
if (!detailTabStyleFiles.includes(detailTabStyleOwner)) fail('共享课程详情 Tab 缺少统一样式 owner')
for (const file of detailTabStyleFiles) {
  if (file !== detailTabStyleOwner) fail(`课程详情 Tab 样式只能由共享组件持有：${path.relative(root, file)}`)
}

const courseCardTemplate = fs.readFileSync(path.join(miniRoot, 'components/course-card/index.wxml'), 'utf8')
if (!/^\s*<button\b[^>]*\bclass="[^"]*\bcourse\b[^"]*"/i.test(courseCardTemplate)) {
  fail('course-card 根交互节点必须保持原生 button')
}

const runtimeJavaScript = walk(miniRoot).filter(file => file.endsWith('.js'))
const forbiddenEndpoints = [
  ['微信登录', /['"`]\/auth(?:\/|['"`?#])/],
  ['收藏', /['"`]\/favorites(?:['"`/?])/],
  ['个人数据', /['"`]\/me(?:\/|['"`?#])/],
  ['资料投稿', /['"`]\/resource-submissions(?:['"`/?])/],
  ['资料详情或举报', /['"`]\/resources\//],
  ['旧课程评价', /['"`]\/courses\/[^\r\n]*\/reviews(?:['"`/?])/],
  ['评价写入', /['"`]\/reviews(?:['"`?#])/]
]

for (const file of runtimeJavaScript) {
  const source = fs.readFileSync(file, 'utf8')
  for (const [name, pattern] of forbiddenEndpoints) {
    if (pattern.test(source)) fail(`未开放端点仍存在于小程序运行代码：${name} -> ${path.relative(root, file)}`)
  }
}

const publicApiOwner = path.join(miniRoot, 'services', 'public-api.js')
const adapterOnlyReadEndpoints = [
  ['搜索索引', /['"`]\/search-index(?:['"`?#])/],
  ['指南读取', /['"`]\/guides(?:\/|\?|['"`])/]
]
for (const file of runtimeJavaScript) {
  if (file === publicApiOwner) continue
  const source = fs.readFileSync(file, 'utf8')
  for (const [name, pattern] of adapterOnlyReadEndpoints) {
    if (pattern.test(source)) fail(`${name}路径只能由 public-api adapter 持有：${path.relative(root, file)}`)
  }
}

const pageJavaScript = [path.join(miniRoot, 'pages'), path.join(miniRoot, 'components')].flatMap(walk).filter(file => file.endsWith('.js'))
const directPublicPath = /['"`]\/(?:health|home|search-index(?:\/|['"`])|guides(?:\/|['"`])|courses(?:\/|['"`])|review-groups(?:\/|['"`]))/
for (const file of pageJavaScript) {
  const source = fs.readFileSync(file, 'utf8')
  if (directPublicPath.test(source)) fail(`页面或组件不得直接拼接生产公开路径：${path.relative(root, file)}`)
  if (/utils\/request|utils\\request/.test(source)) fail(`页面或组件必须通过 public-api adapter 请求：${path.relative(root, file)}`)
  if (/\bwx\.request\s*\(/.test(source)) fail(`页面或组件不得直接调用 wx.request：${path.relative(root, file)}`)
}

if (!fs.existsSync(path.join(miniRoot, 'lib/fuse.js'))) fail('缺少本地 Fuse.js 搜索库')

const miniConfig = require(path.join(miniRoot, 'config.js'))
const trialApiBaseUrl = miniConfig.resolveApiBaseUrl('trial')
const releaseApiBaseUrl = miniConfig.resolveApiBaseUrl('release')
if (!trialApiBaseUrl.startsWith('https://')) fail('体验版 API 必须使用 HTTPS')
if (!releaseApiBaseUrl.startsWith('https://')) fail('正式版 API 必须使用 HTTPS')
if (/127\.0\.0\.1|localhost|\d+\.\d+\.\d+\.\d+/.test(`${trialApiBaseUrl}${releaseApiBaseUrl}`)) {
  fail('体验版和正式版 API 不得使用 localhost 或服务器 IP')
}

const trackedText = walk(root).filter(file => !file.includes(`${path.sep}.git${path.sep}`) && !/\.(png|jpg|jpeg|gif|ico)$/i.test(file) && !file.endsWith('runtime.json'))
const secretPatterns = [
  { name: '服务器明文密码', pattern: /pwd\s*[:=]\s*\S+/i },
  { name: '私钥', pattern: /BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/ },
  { name: '微信密钥赋值', pattern: /WECHAT_SECRET\s*=\s*[^\s#][^\r\n]*/ }
]
for (const file of trackedText) {
  const source = fs.readFileSync(file, 'utf8')
  for (const check of secretPatterns) {
    if (check.pattern.test(source) && !file.endsWith('.env.example') && !file.endsWith('check-miniprogram.js')) fail(`${check.name}疑似写入：${path.relative(root, file)}`)
  }
}

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'))
  process.exit(1)
}
console.log(`NKUStudy 小程序静态检查通过：${app.pages.length} 个页面，${tabPages.size} 个 Tab。`)
