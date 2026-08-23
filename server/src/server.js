const path = require('node:path')
const { createApp } = require('./app')
const { createGuideAssistant } = require('./guide-assistant')
const { createLearningCompassProjection, readLearningCompassData } = require('./learning-compass')

const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '127.0.0.1'
const projectRoot = path.resolve(__dirname, '../..')
const learningCompassDataPath = process.env.LEARNING_COMPASS_DATA_PATH
  ? path.resolve(projectRoot, process.env.LEARNING_COMPASS_DATA_PATH)
  : ''
const learningCompass = learningCompassDataPath
  ? createLearningCompassProjection(readLearningCompassData(learningCompassDataPath))
  : null
const guideAssistantEnabled = process.env.LEARNING_COMPASS_ASSISTANT_ENABLED === 'true'
if (guideAssistantEnabled && !learningCompass) {
  throw new Error('LEARNING_COMPASS_ASSISTANT_ENABLED requires LEARNING_COMPASS_DATA_PATH')
}
if (guideAssistantEnabled && !['127.0.0.1', 'localhost', '::1'].includes(host)) {
  throw new Error('learning compass assistant is local-only and requires a loopback HOST')
}
const options = {
  dbPath: process.env.DB_PATH || path.join(__dirname, '../data/runtime.json'),
  seedPath: path.join(__dirname, '../data/seed.json'),
  adminPath: path.join(__dirname, '../../admin/index.html'),
  adminLogoPath: path.join(__dirname, '../../assets/branding/nkustudy-avatar-v2-nankai-128.png'),
  tokenSecret: process.env.TOKEN_SECRET || `local-${Math.random().toString(36)}-${Date.now()}`,
  adminKey: process.env.ADMIN_KEY || '',
  allowDevLogin: process.env.ALLOW_DEV_LOGIN === 'true',
  wechatAppId: process.env.WECHAT_APPID || '',
  wechatSecret: process.env.WECHAT_SECRET || '',
  learningCompass,
  guideAssistant: guideAssistantEnabled ? createGuideAssistant({ learningCompass }) : null
}

if (!process.env.TOKEN_SECRET) console.warn('[security] TOKEN_SECRET 未配置，本次启动使用临时密钥。')
if (!options.adminKey) console.warn('[security] ADMIN_KEY 未配置，管理写操作已禁用。')
if (options.allowDevLogin) console.warn('[security] ALLOW_DEV_LOGIN 已启用，仅可用于本地开发。')
if (options.learningCompass) console.warn('[local-only] 已加载学习指南针本地生成数据；draft/review 不会进入公共投影。')
if (options.guideAssistant) console.warn('[local-only] 已启用确定性学习指南针问答；不会调用外部模型。')

const server = createApp(options)
server.listen(port, host, () => {
  console.log(`NKUStudy API running at http://${host}:${port}`)
  console.log(`Admin UI: http://${host}:${port}/admin/`)
})
