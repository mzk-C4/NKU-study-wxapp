const fs = require('node:fs')
const path = require('node:path')
const { buildLearningCompass } = require('../server/src/learning-compass')

const projectRoot = path.resolve(__dirname, '..')
const outputPath = path.resolve(projectRoot, 'server/data/learning-compass.generated.json')
const checkOnly = process.argv.includes('--check')

const knowledgeBase = buildLearningCompass({
  manifestPath: path.join(projectRoot, 'Documents/SOURCE_MANIFEST.md'),
  guidesDir: path.join(projectRoot, 'Documents/学习指南针内容草稿/guides')
})
const output = `${JSON.stringify(knowledgeBase, null, 2)}\n`

if (checkOnly) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== output) {
    console.error('learning compass generated data is missing or stale')
    process.exitCode = 1
  } else {
    console.log(`learning compass data is current: ${knowledgeBase.guides.length} guides, version ${knowledgeBase.version}`)
  }
} else {
  fs.writeFileSync(outputPath, output, 'utf8')
  console.log(`generated ${path.relative(projectRoot, outputPath)} with ${knowledgeBase.guides.length} guides, version ${knowledgeBase.version}`)
}
