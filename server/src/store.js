const fs = require('node:fs')
const path = require('node:path')

class JsonStore {
  constructor({ dbPath, seedPath }) {
    this.dbPath = path.resolve(dbPath)
    this.seedPath = path.resolve(seedPath)
    this.writeQueue = Promise.resolve()
    this.ensureDatabase()
  }

  ensureDatabase() {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true })
    if (!fs.existsSync(this.dbPath)) {
      const seed = fs.readFileSync(this.seedPath, 'utf8')
      fs.writeFileSync(this.dbPath, seed, { encoding: 'utf8', flag: 'wx' })
    }
  }

  read() {
    return JSON.parse(fs.readFileSync(this.dbPath, 'utf8'))
  }

  async mutate(mutator) {
    let output
    const operation = this.writeQueue.catch(() => {}).then(async () => {
      const data = this.read()
      output = await mutator(data)
      const temporaryPath = `${this.dbPath}.${process.pid}.tmp`
      fs.writeFileSync(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
      fs.renameSync(temporaryPath, this.dbPath)
    })
    this.writeQueue = operation.catch(() => {})
    await operation
    return output
  }
}

module.exports = { JsonStore }
