// Read only JavaScript literals from upstream; never evaluate downloaded code.
const fs = require('node:fs')
const path = require('node:path')
const ROOT = path.resolve(__dirname, '..')
const DATA = path.join(ROOT, 'miniprogram/features/campus-map/data.js')
const CONFIG = path.join(__dirname, 'campus-map-source.json')

function literalExport(source, name) {
  const match = new RegExp(`^export const ${name}\\s*=\\s*`, 'm').exec(source)
  if (!match) throw Error(`Missing export: ${name}`)
  let i = match.index + match[0].length
  function space() {
    while (i < source.length) {
      if (/\s/.test(source[i])) { i++; continue }
      if (source.startsWith('//', i)) { const end = source.indexOf('\n', i); i = end < 0 ? source.length : end; continue }
      if (source.startsWith('/*', i)) { const end = source.indexOf('*/', i + 2); if (end < 0) throw Error('Unclosed comment'); i = end + 2; continue }
      break
    }
  }
  function string() {
    const quote = source[i++]
    let value = ''
    while (i < source.length) {
      const char = source[i++]
      if (char === quote) return value
      if (char === '\n' || char === '\r') throw Error('Multiline literal is unsupported')
      if (char !== '\\') { value += char; continue }
      const escaped = source[i++]
      if (escaped === 'u') {
        const hex = source.slice(i, i + 4)
        if (!/^[0-9a-f]{4}$/i.test(hex)) throw Error('Invalid unicode escape')
        value += String.fromCharCode(parseInt(hex, 16)); i += 4
      } else {
        const escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '\\': '\\', '/': '/', '"': '"', "'": "'" }
        if (!Object.hasOwn(escapes, escaped)) throw Error('Unsupported escape')
        value += escapes[escaped]
      }
    }
    throw Error('Unclosed string')
  }
  function value(depth = 0) {
    if (depth > 20) throw Error('Data nesting too deep')
    space()
    if (source[i] === '"' || source[i] === "'") return string()
    if (source[i] === '{' || source[i] === '[') {
      const object = source[i++] === '{'
      const end = object ? '}' : ']'
      const result = object ? Object.create(null) : []
      space()
      while (source[i] !== end) {
        if (object) {
          let key
          if (source[i] === '"' || source[i] === "'") key = string()
          else { const token = /^[A-Za-z_$][\w$]*/.exec(source.slice(i)); if (!token) throw Error('Invalid object key'); key = token[0]; i += key.length }
          if (['__proto__', 'constructor', 'prototype'].includes(key) || Object.hasOwn(result, key)) throw Error('Unsafe or duplicate key')
          space(); if (source[i++] !== ':') throw Error('Expected colon')
          result[key] = value(depth + 1)
        } else result.push(value(depth + 1))
        space()
        if (source[i] === end) break
        if (source[i++] !== ',') throw Error('Only literal data is accepted')
        space()
      }
      i++; return result
    }
    const token = /^(?:-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|true|false|null)\b/i.exec(source.slice(i))
    if (!token) throw Error('Only literal data is accepted')
    i += token[0].length; return JSON.parse(token[0])
  }
  const result = value()
  space(); if (source[i] === ';') { i++; space() }
  if (i < source.length && !source.startsWith('export const ', i)) throw Error(`Expression after ${name} is unsupported`)
  return result
}

function adapt(source, config) {
  const categories = literalExport(source, 'CATEGORY_CONFIG')
  const icons = literalExport(source, 'CATEGORY_ICON_PATHS')
  const campuses = literalExport(source, 'CAMPUS_CONFIG')
  const sourceBuildings = literalExport(source, 'BUILDINGS')
  if (!Array.isArray(sourceBuildings) || !sourceBuildings.length) throw Error('Empty building data')
  const markerIds = { ...config.markerIds }
  const reserved = Object.values(markerIds)
  if (reserved.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(reserved).size !== reserved.length) throw Error('Invalid marker ID registry')
  let nextId = Math.max(0, ...reserved) + 1
  const seen = new Set()
  const coordValid = coord => Array.isArray(coord) && coord.length === 2 && Number.isFinite(coord[0]) && Number.isFinite(coord[1]) && coord[0] > 117 && coord[0] < 118 && coord[1] > 38 && coord[1] < 40
  for (const [id, campus] of Object.entries(campuses)) {
    if (!/^[a-z]+$/.test(id) || !campus.name || !coordValid(campus.coord) || !(campus.zoom >= 3 && campus.zoom <= 20)) throw Error(`Invalid campus: ${id}`)
  }
  for (const [key, category] of Object.entries(categories)) {
    if (!/^[a-z]+$/.test(key) || !category.label || !/^#[0-9a-f]{6}$/i.test(category.color) || typeof icons[key] !== 'string') throw Error(`Invalid category: ${key}`)
    // Restrict SVG to geometry with numeric attributes. No links, scripts or external resources.
    if (!/^(?:<(?:path|circle|rect|line|polyline|polygon|ellipse)(?:\s+(?:d|x|y|cx|cy|r|rx|ry|width|height|points|x1|x2|y1|y2)="[\d\s.,+\-a-zA-Z]*")*\s*\/>)+$/.test(icons[key])) throw Error(`Unsafe SVG: ${key}`)
    category.markerIcon = `/assets/campus-map/markers/${key}.png`
  }
  const buildings = sourceBuildings.map(place => {
    if (typeof place.id !== 'string' || !/^[a-z0-9_]+$/.test(place.id) || seen.has(place.id)) throw Error('Invalid or duplicate place ID')
    seen.add(place.id)
    if (!Object.hasOwn(campuses, place.campusId) || !Object.hasOwn(categories, place.category) || !coordValid(place.coord) || typeof place.name !== 'string' || !place.name || typeof place.desc !== 'string') throw Error(`Invalid place: ${place.id}`)
    if (!Object.hasOwn(markerIds, place.id)) markerIds[place.id] = nextId++
    const result = { id: place.id, name: place.name, category: place.category, campusId: place.campusId, coord: place.coord, desc: place.desc }
    const photos = place.photos || (place.photo ? [place.photo] : [])
    if (!Array.isArray(photos)) throw Error(`Invalid photos: ${place.id}`)
    if (photos.length) result.images = photos.map(photo => {
      const image = config.images[photo]
      if (!image || !/^\/assets\/campus-map\/[a-zA-Z0-9_/-]+\.(?:png|jpg|jpeg|webp)$/.test(image.src)) throw Error(`Add a local image mapping for ${photo}`)
      if (!fs.existsSync(path.join(ROOT, 'miniprogram', image.src))) throw Error(`Missing image: ${image.src}`)
      return { src: image.src, caption: image.caption || place.name }
    })
    if (place.article) {
      if (typeof place.article !== 'string' || !/^\/pages\/[A-Za-z0-9_/-]+\/(?:#[^\s\\]*)?$/.test(place.article)) throw Error(`Invalid article: ${place.id}`)
      result.article = `https://freshnkuer.wiki${place.article}`
    }
    result.markerId = markerIds[place.id]
    return result
  })
  return { data: { categories, campuses, buildings }, markerIds, icons }
}

function compare(previous, next) {
  const before = new Map(previous.buildings.map(place => [place.id, place]))
  const after = new Map(next.buildings.map(place => [place.id, place]))
  return {
    count: next.buildings.length,
    added: [...after.keys()].filter(id => !before.has(id)),
    removed: [...before.keys()].filter(id => !after.has(id)),
    changed: next.buildings.filter(place => before.has(place.id) && JSON.stringify(before.get(place.id)) !== JSON.stringify(place)).map(place => place.id),
    categoriesChanged: JSON.stringify(previous.categories) !== JSON.stringify(next.categories),
    campusesChanged: JSON.stringify(previous.campuses) !== JSON.stringify(next.campuses)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const option = key => args.includes(key) ? args[args.indexOf(key) + 1] : ''
  const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
  const revision = option('--revision') || config.revision
  if (!/^[0-9a-f]{40}$/.test(revision)) throw Error('Use a full upstream commit SHA')
  const sourceUrl = `https://raw.githubusercontent.com/NKUwiki/NKUwiki/${revision}/docs/.vitepress/data/map-data.js`
  let source
  if (option('--source')) source = fs.readFileSync(option('--source'), 'utf8')
  else {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw Error(`Source HTTP ${response.status}`)
    source = await response.text()
  }
  if (source.length > 1000000) throw Error('Source exceeds 1 MB')
  const result = adapt(source, config)
  const diff = compare(require(DATA), result.data)
  console.log(JSON.stringify({ revision, ...diff }, null, 2))
  if (!args.includes('--write')) return
  // Decode all icons before writing any data. sharp is a developer-only optional dependency.
  const sharp = require(option('--sharp-module') || 'sharp')
  const buffers = await Promise.all(Object.keys(result.data.categories).map(async key => {
    const color = result.data.categories[key].color
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100" viewBox="0 0 40 50"><path d="M20 48C16 41 2 30 2 20a18 18 0 1 1 36 0c0 10-14 21-18 28Z" fill="${color}" stroke="#fff" stroke-width="2"/><g transform="translate(8 8)" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${result.icons[key]}</g></svg>`
    return { key, buffer: await sharp(Buffer.from(svg)).png().toBuffer() }
  }))
  const markerDir = path.join(ROOT, 'miniprogram/assets/campus-map/markers')
  fs.mkdirSync(markerDir, { recursive: true })
  for (const { key, buffer } of buffers) fs.writeFileSync(path.join(markerDir, `${key}.png`), buffer)
  fs.writeFileSync(DATA, `// Adapted from NKUwiki; GCJ02. See SOURCE.md. Generated by scripts/sync-campus-map.js.\nmodule.exports = ${JSON.stringify(result.data, null, 2)}\n`)
  fs.writeFileSync(CONFIG, JSON.stringify({ ...config, revision, markerIds: result.markerIds }, null, 2) + '\n')
  fs.writeFileSync(path.join(ROOT, 'miniprogram/features/campus-map/source.js'), 'module.exports = ' + JSON.stringify({
    revision, url: `https://github.com/NKUwiki/NKUwiki/blob/${revision}/docs/.vitepress/data/map-data.js`,
    website: 'https://freshnkuer.wiki', contributor: 'cure 学长的 wiki 项目组', contentLicense: 'CC BY-NC-SA 4.0'
  }, null, 2) + '\n')
  console.log('Updated local data and marker assets; existing numeric IDs reserved.')
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { literalExport, adapt, compare }
