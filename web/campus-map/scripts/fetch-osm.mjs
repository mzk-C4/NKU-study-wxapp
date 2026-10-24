/**
 * Downloads public OSM geometry for offline review.
 * Run this manually only after confirming the network and ODbL usage plan.
 * It intentionally does not publish anything or mutate the main website.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const endpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
]
const query = [
  '[out:json][timeout:120];',
  '(',
  '  way(476603067);',
  '  way[building](38.9780,117.3240,38.9990,117.3540);',
  '  way[highway](38.9780,117.3240,38.9990,117.3540);',
  '  way[leisure~"park|garden|pitch"](38.9780,117.3240,38.9990,117.3540);',
  '  way[landuse~"grass|recreation_ground"](38.9780,117.3240,38.9990,117.3540);',
  '  way[natural~"water|wood"](38.9780,117.3240,38.9990,117.3540);',
  ');',
  'out tags geom;'
].join('\n')

let payload
let lastError
for (const endpoint of endpoints) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'user-agent': 'NKUlawer-CampusMapLab/0.1 (offline modelling experiment)'
      },
      body: new URLSearchParams({ data: query })
    })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    payload = await response.json()
    console.log(`Downloaded from ${endpoint}`)
    break
  } catch (error) {
    lastError = error
  }
}
if (!payload) throw new Error(`No Overpass endpoint was reachable. ${lastError instanceof Error ? lastError.message : ''}`)
const outputDir = resolve('data')
await mkdir(outputDir, { recursive: true })
await writeFile(resolve(outputDir, 'jinnan-osm.raw.json'), JSON.stringify(payload, null, 2), 'utf8')
console.log(`Saved ${payload.elements?.length ?? 0} OSM elements to data/jinnan-osm.raw.json`)
