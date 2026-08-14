#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { AdapterValidationError, adaptWebsiteData } = require('../src/website-adapter')

function readJson(filePath, label) {
  if (!filePath) throw new Error(`${label} path is required`)
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'))
}

function parseArgs(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument near ${key || '<end>'}`)
    result[key.slice(2)] = value
  }
  return result
}

try {
  const args = parseArgs(process.argv.slice(2))
  const manifest = readJson(args.manifest, 'manifest')
  const reviewStore = readJson(args.reviews, 'reviews')
  const metadata = args.metadata ? readJson(args.metadata, 'metadata') : {}
  const result = adaptWebsiteData({
    manifest,
    reviews: Array.isArray(reviewStore) ? reviewStore : reviewStore.reviews,
    catalogMetadata: metadata.courses || metadata,
    guides: metadata.guides || []
  })
  console.log(JSON.stringify(result.report, null, 2))
} catch (error) {
  if (error instanceof AdapterValidationError) {
    console.error(JSON.stringify({ ok: false, issues: error.issues }, null, 2))
    process.exitCode = 1
  } else {
    console.error(error.message)
    process.exitCode = 2
  }
}
