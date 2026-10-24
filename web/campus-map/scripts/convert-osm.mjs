/** Converts the raw Overpass response into a small GeoJSON review artifact. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const source = resolve('data', 'jinnan-osm.raw.json')
const raw = JSON.parse(await readFile(source, 'utf8'))
const featureFor = (element) => {
  if (!Array.isArray(element.geometry) || element.geometry.length < 2) return null
  const coordinates = element.geometry.map((point) => [point.lon, point.lat])
  const tags = element.tags ?? {}
  const isCampusBoundary = element.id === 476603067
  const isArea = Boolean(isCampusBoundary || tags.building || tags.leisure || tags.landuse || tags.natural)
  if (isArea && (coordinates[0][0] !== coordinates.at(-1)[0] || coordinates[0][1] !== coordinates.at(-1)[1])) coordinates.push([...coordinates[0]])
  return {
    type: 'Feature',
    properties: {
      osm_id: element.id,
      osm_type: element.type,
      kind: isCampusBoundary ? 'campus-boundary' : tags.building ? 'building' : tags.highway ? 'road' : tags.natural === 'water' ? 'water' : 'green',
      name: tags.name ?? tags['name:zh'] ?? null,
      height_m: Number(tags.height) || (Number(tags.levels ?? tags['building:levels']) ? Number(tags.levels ?? tags['building:levels']) * 3.6 : null),
      raw_tags: tags
    },
    geometry: { type: isArea ? 'Polygon' : 'LineString', coordinates: isArea ? [coordinates] : coordinates }
  }
}

const features = raw.elements.map(featureFor).filter(Boolean)
const output = { type: 'FeatureCollection', source: '© OpenStreetMap contributors, ODbL 1.0', generated_at: new Date().toISOString(), features }
await mkdir(resolve('data'), { recursive: true })
await writeFile(resolve('data', 'jinnan-osm.geojson'), JSON.stringify(output), 'utf8')
console.log(`Wrote ${features.length} review features to data/jinnan-osm.geojson`)
