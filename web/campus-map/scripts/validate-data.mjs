import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const reviewData = resolve('data', 'jinnan-osm.geojson')
if (!existsSync(reviewData)) {
  console.log('Seed-model validation passed. No OSM review data is present yet.')
  process.exit(0)
}
const payload = JSON.parse(await readFile(reviewData, 'utf8'))
const invalid = payload.features.filter((feature) => !feature.geometry || !feature.properties?.kind)
if (invalid.length) throw new Error(`Invalid GeoJSON review features: ${invalid.length}`)
const manifestPath = resolve('data', 'jinnan-model-manifest.json')
if (!existsSync(manifestPath)) throw new Error('OSM model manifest is missing. Run npm run build:model.')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
if (manifest.status !== 'osm-imported-needs-campus-verification') throw new Error('Unexpected model manifest status.')
if (manifest.counts.buildings < 50 || manifest.counts.roads < 20 || manifest.counts.landscapes < 10) throw new Error('OSM model is unexpectedly sparse; do not use it for a campus-scale test.')
for (const value of Object.values(manifest.bounds_meters)) if (!Number.isFinite(value)) throw new Error('Model bounds contain a non-finite coordinate.')
console.log(`OSM model validation passed: ${manifest.counts.buildings} buildings, ${manifest.counts.roads} roads, ${manifest.counts.landscapes} landscapes.`)
