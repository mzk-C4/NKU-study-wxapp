import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { loadLocalTs } from './load-local-ts.mjs'

// Run from web/campus-map. Generated IDs only: never copy planar coordinates
// or search/favorites state into the native map.
const { campusModel } = await loadLocalTs('src/data/campus-model.ts')
const { createPlaceCatalog } = await loadLocalTs('src/map-places.ts')
const ids = createPlaceCatalog(campusModel).map(place => place.id).sort()
const file = new URL('../../../miniprogram/features/campus-map-3d/place-ids.js', import.meta.url)
const source = '// Generated from web/campus-map by scripts/sync-place-ids.mjs --write.\nmodule.exports = ' + JSON.stringify(ids, null, 2) + '\n'
if (process.argv.includes('--write')) await writeFile(file, source)
else assert.equal((await readFile(file, 'utf8')).replace(/\r\n/g, '\n'), source, 'Native share IDs drifted; run sync-place-ids.mjs --write after reviewing catalog changes')
console.log(`Native share allowlist: ${ids.length} place IDs verified.`)
