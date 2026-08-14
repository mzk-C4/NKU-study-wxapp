const fs = require('node:fs')
const path = require('node:path')
const childProcess = require('node:child_process')
const Module = require('node:module')

const candidates = [
  process.env.WECHAT_DEVTOOLS_HOME,
  'D:/Program Files (x86)/微信web开发者工具',
  'C:/Program Files (x86)/Tencent/微信web开发者工具',
  'C:/Program Files (x86)/微信web开发者工具'
].filter(Boolean)

const installRoot = candidates.find(candidate => fs.existsSync(path.join(candidate, 'cli.bat')))
if (!installRoot) {
  console.error('未找到微信开发者工具。请将 WECHAT_DEVTOOLS_HOME 设置为安装目录。')
  process.exit(1)
}

const bundledNode = path.join(installRoot, 'node.exe')
if (process.env.NKUSTUDY_WECHAT_CLI_CHILD !== '1' && path.resolve(process.execPath) !== path.resolve(bundledNode)) {
  const invocationDirectory = process.cwd()
  const forwardedArguments = process.argv.slice(2).map((argument, index, argumentsList) => {
    const previousArgument = argumentsList[index - 1]
    if (previousArgument === '--project' && !path.isAbsolute(argument)) {
      return path.resolve(invocationDirectory, argument)
    }
    if (argument.startsWith('--project=')) {
      const projectPath = argument.slice('--project='.length)
      return `--project=${path.isAbsolute(projectPath) ? projectPath : path.resolve(invocationDirectory, projectPath)}`
    }
    return argument
  })
  const result = childProcess.spawnSync(bundledNode, [__filename, ...forwardedArguments], {
    stdio: 'inherit',
    cwd: installRoot,
    env: { ...process.env, cwd: invocationDirectory, NKUSTUDY_WECHAT_CLI_CHILD: '1' }
  })
  process.exit(result.status == null ? 1 : result.status)
}

const cliEntry = path.join(installRoot, 'code/package.nw/js/common/cli/index.js')
if (!fs.existsSync(cliEntry)) {
  console.error(`开发者工具 CLI 入口不存在：${cliEntry}`)
  process.exit(1)
}

const bridgePort = Number(process.env.WECHAT_CLI_BRIDGE_PORT || 19399)
if (!Number.isInteger(bridgePort) || bridgePort < 1024 || bridgePort > 65535) {
  console.error('WECHAT_CLI_BRIDGE_PORT 必须是 1024～65535 的整数。')
  process.exit(1)
}

let source = fs.readFileSync(cliEntry, 'utf8')
const marker = 'let j=3799;'
if (!source.includes(marker)) {
  console.error('当前开发者工具版本不需要或不兼容端口修复，请直接使用官方 cli.bat。')
  process.exit(1)
}
source = source.replace(marker, `let j=${bridgePort};`)

process.argv = [bundledNode, cliEntry, ...process.argv.slice(2)]
const patchedModule = new Module(cliEntry, module)
patchedModule.filename = cliEntry
patchedModule.paths = Module._nodeModulePaths(path.dirname(cliEntry))
patchedModule._compile(source, cliEntry)
