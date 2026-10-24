/**
 * Builds the renderer model from reviewed OSM export.
 * The output remains an offline lab artifact and is not a publication step.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const source = resolve('data', 'jinnan-osm.geojson')
const output = resolve('src', 'data', 'jinnan-model.ts')
const collection = JSON.parse(await readFile(source, 'utf8'))
const boundary = collection.features.find((feature) => feature.properties?.kind === 'campus-boundary')
if (!boundary?.geometry?.coordinates?.[0]?.length) throw new Error('Campus boundary (OSM way 476603067) was not found in the OSM export.')

const boundaryRing = boundary.geometry.coordinates[0]
const longitude = boundaryRing.map(([lng]) => lng)
const latitude = boundaryRing.map(([, lat]) => lat)
const origin = { lng: Math.min(...longitude), lat: Math.min(...latitude) }
const metersPerLongitude = 111_320 * Math.cos((origin.lat * Math.PI) / 180)
const metersPerLatitude = 110_574
// 渲染坐标约定：X 轴向东，Z 轴向南。Three.js 默认视角由南向北看时，
// 这样可保持“北在屏幕上方、东在屏幕右侧”，与常规卫星地图一致。
const project = ([lng, lat]) => [
  Number(((lng - origin.lng) * metersPerLongitude).toFixed(2)),
  Number((-(lat - origin.lat) * metersPerLatitude).toFixed(2))
]
const pointInPolygon = ([x, y], polygon) => {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersects = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}
const center = (points) => [points.reduce((sum, [x]) => sum + x, 0) / points.length, points.reduce((sum, [, y]) => sum + y, 0) / points.length]
const projectedBoundary = boundaryRing.map(project)
const pointToSegmentDistance = (point, start, end) => {
  const deltaX = end[0] - start[0]
  const deltaY = end[1] - start[1]
  const lengthSquared = deltaX * deltaX + deltaY * deltaY || 1
  const ratio = Math.max(0, Math.min(1, ((point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaY) / lengthSquared))
  return Math.hypot(point[0] - (start[0] + deltaX * ratio), point[1] - (start[1] + deltaY * ratio))
}
const isPointNearCampus = (coordinate, bufferMeters = 0) => {
  const point = project(coordinate)
  if (pointInPolygon(point, projectedBoundary)) return true
  return projectedBoundary.some((start, index) => pointToSegmentDistance(point, start, projectedBoundary[(index + 1) % projectedBoundary.length]) <= bufferMeters)
}
// 校界在开放数据中通常比真实道路、桥梁和建筑红线更窄；保留邻接 90 米的对象，
// 既恢复外围主路，也避免把远处的社会建筑混入校园白模。
const isFeatureNearCampus = (coordinates, bufferMeters = 90) => isPointNearCampus(center(coordinates), bufferMeters)
const boundaryBounds = {
  minX: Math.min(...projectedBoundary.map(([x]) => x)),
  maxX: Math.max(...projectedBoundary.map(([x]) => x)),
  minZ: Math.min(...projectedBoundary.map(([, z]) => z)),
  maxZ: Math.max(...projectedBoundary.map(([, z]) => z))
}
const renderBounds = {
  minX: boundaryBounds.minX - 90,
  maxX: boundaryBounds.maxX + 90,
  minZ: boundaryBounds.minZ - 90,
  maxZ: boundaryBounds.maxZ + 90
}
const samePoint = (left, right) => Math.abs(left[0] - right[0]) < .01 && Math.abs(left[1] - right[1]) < .01
const clipSegmentToBounds = (start, end, bounds) => {
  const deltaX = end[0] - start[0]
  const deltaZ = end[1] - start[1]
  let minimum = 0
  let maximum = 1
  for (const [p, q] of [
    [-deltaX, start[0] - bounds.minX], [deltaX, bounds.maxX - start[0]],
    [-deltaZ, start[1] - bounds.minZ], [deltaZ, bounds.maxZ - start[1]]
  ]) {
    if (Math.abs(p) < Number.EPSILON) {
      if (q < 0) return null
      continue
    }
    const ratio = q / p
    if (p < 0) {
      if (ratio > maximum) return null
      minimum = Math.max(minimum, ratio)
    } else {
      if (ratio < minimum) return null
      maximum = Math.min(maximum, ratio)
    }
  }
  return [
    [start[0] + deltaX * minimum, start[1] + deltaZ * minimum],
    [start[0] + deltaX * maximum, start[1] + deltaZ * maximum]
  ]
}
// 不把一条仅擦过校界的长道路整段塞进模型；按白模边界裁成连续的校内片段。
const clipPolylineToBounds = (points, bounds) => {
  const parts = []
  let current = []
  for (let index = 1; index < points.length; index += 1) {
    const segment = clipSegmentToBounds(points[index - 1], points[index], bounds)
    if (!segment) {
      if (current.length > 1) parts.push(current)
      current = []
      continue
    }
    if (!current.length) current.push(segment[0], segment[1])
    else if (samePoint(current.at(-1), segment[0])) current.push(segment[1])
    else {
      if (current.length > 1) parts.push(current)
      current = [segment[0], segment[1]]
    }
  }
  if (current.length > 1) parts.push(current)
  return parts.map((part) => part.filter((point, index) => index === 0 || !samePoint(point, part[index - 1])))
}
const areaSquareMeters = (points) => Math.abs(points.reduce((sum, point, index) => {
  const next = points[(index + 1) % points.length]
  return sum + point[0] * next[1] - next[0] * point[1]
}, 0) / 2) * metersPerLongitude * metersPerLatitude

const categoryFor = (feature) => {
  const name = String(feature.properties.name ?? '')
  const tags = feature.properties.raw_tags ?? {}
  if (/图书馆/.test(name)) return 'library'
  if (/法学院|主楼|纪念碑/.test(name)) return 'landmark'
  if (/体育|运动|球场/.test(name) || tags.building === 'sports_centre') return 'sport'
  if (/宿舍|公寓|领寓/.test(name) || tags.building === 'dormitory') return 'residence'
  if (/食堂|医院|活动中心|综合业务|服务|管理/.test(name)) return 'service'
  return 'academic'
}
const defaultHeight = (feature) => {
  const tags = feature.properties.raw_tags ?? {}
  const recorded = Number(feature.properties.height_m)
  if (Number.isFinite(recorded) && recorded > 3) return Math.min(recorded, 80)
  const levels = Number(tags.levels ?? tags['building:levels'])
  if (Number.isFinite(levels) && levels > 0) return Math.min(levels * 3.6, 80)
  const category = categoryFor(feature)
  return ({ library: 40, landmark: 32, service: 22, residence: 27, sport: 18, academic: 24 })[category]
}
const zoneFor = (coordinates) => {
  const [x, y] = project(center(coordinates))
  const bounds = { minX: Math.min(...boundaryRing.map(project).map(([px]) => px)), maxX: Math.max(...boundaryRing.map(project).map(([px]) => px)), minY: Math.min(...boundaryRing.map(project).map(([, py]) => py)), maxY: Math.max(...boundaryRing.map(project).map(([, py]) => py)) }
  const horizontal = x < (bounds.minX + bounds.maxX) / 2 ? '西部校区' : '东部校区'
  return y < (bounds.minY + bounds.maxY) / 2 ? `北部 · ${horizontal}` : `南部 · ${horizontal}`
}

const buildingFeatures = collection.features
  .filter((feature) => feature.properties?.kind === 'building' && feature.geometry?.type === 'Polygon')
  .filter((feature) => {
    const ring = feature.geometry.coordinates[0]
    return ring?.length >= 4 && isFeatureNearCampus(ring) && areaSquareMeters(ring) >= 70
  })
  .sort((a, b) => Number(a.properties.osm_id) - Number(b.properties.osm_id))

// 用户确认东侧 A/B/C/D 为实验楼；按 OSM ID 覆盖名称，刷新数据时也保留。
const laboratoryNames = {
  '1456224124': '实验楼A', '1456224123': '实验楼B',
  '1456224121': '实验楼C', '1456224120': '实验楼D',
  '1456224125': '实验楼A内侧连廊', '1456224122': '实验楼B/C连廊',
}
const buildings = buildingFeatures.map((feature, index) => {
  const ring = feature.geometry.coordinates[0].slice(0, -1)
  const laboratoryName = laboratoryNames[String(feature.properties.osm_id)]
    const isMainStadiumStand = String(feature.properties.osm_id) === '1474145904'
    const name = isMainStadiumStand ? '文科主体育场主席台' : laboratoryName || feature.properties.name || `未命名建筑 ${String(index + 1).padStart(3, '0')}`
  return {
    id: `osm-building-${feature.properties.osm_id}`,
    name,
      aliases: isMainStadiumStand ? ['文科主体育场主席台', '主体育场主席台', '文科体育场看台', '主席台', '体育场西看台', '未命名建筑 069'] : laboratoryName
      ? [...new Set([laboratoryName, ...(feature.properties.name ? [feature.properties.name] : []), '东侧实验楼', ...(laboratoryName.length === 4 ? [`${laboratoryName[3]}实验楼`, `${laboratoryName}区`] : ['实验楼连廊'])])]
      : feature.properties.name ? [feature.properties.name] : ['未命名建筑'],
    category: categoryFor(feature),
    height: Number(defaultHeight(feature).toFixed(1)),
    footprint: ring.map(project),
    zone: zoneFor(ring),
    verified: 'osm-import'
  }
})

const usefulHighways = new Set(['primary', 'secondary', 'tertiary', 'residential', 'service', 'unclassified', 'footway', 'path', 'cycleway', 'pedestrian'])
const roads = collection.features
  .filter((feature) => feature.properties?.kind === 'road' && feature.geometry?.type === 'LineString')
  .filter((feature) => {
    const coordinates = feature.geometry.coordinates
    return coordinates.length >= 2 && isFeatureNearCampus(coordinates) && usefulHighways.has(feature.properties.raw_tags?.highway)
  })
  .flatMap((feature, index) => {
    const highway = feature.properties.raw_tags?.highway
    const isPedestrianPath = ['footway', 'path', 'cycleway', 'pedestrian'].includes(highway)
    // 校内 OSM 道路以 residential 为主；这里将其作为连接各教学区的主行车网络。
    const isCampusAvenue = ['motorway', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'residential', 'unclassified', 'living_street'].includes(highway)
    const parts = clipPolylineToBounds(feature.geometry.coordinates.map(project), renderBounds)
    return parts.map((points, partIndex) => ({
      id: `osm-road-${feature.properties.osm_id}-${partIndex + 1}`,
      name: feature.properties.name || `校园道路 ${String(index + 1).padStart(3, '0')}`,
      kind: isPedestrianPath ? 'walkway' : isCampusAvenue ? 'primary' : 'secondary',
      points
    }))
  })

const greens = collection.features
  .filter((feature) => ['green', 'water'].includes(feature.properties?.kind) && feature.geometry?.type === 'Polygon')
  .filter((feature) => feature.geometry.coordinates[0]?.length >= 4 && isFeatureNearCampus(feature.geometry.coordinates[0]))
  .map((feature, index) => ({
    id: `osm-area-${feature.properties.osm_id}`,
    name: feature.properties.name || (feature.properties.kind === 'water' ? `景观水面 ${index + 1}` : `校园绿地 ${index + 1}`),
    kind: feature.properties.kind === 'water' ? 'water' : 'green',
    polygon: feature.geometry.coordinates[0].slice(0, -1).map(project)
  }))

const bounds = renderBounds
const poiBuildings = buildings.filter((building) => building.category === 'landmark' || building.category === 'library' || building.category === 'service').slice(0, 18)
const centerOfFootprint = (points) => [points.reduce((sum, [x]) => sum + x, 0) / points.length, points.reduce((sum, [, z]) => sum + z, 0) / points.length]
const pois = poiBuildings.map((building) => ({ id: `poi-${building.id}`, name: building.name, type: 'service', position: centerOfFootprint(building.footprint) }))

const model = {
  meta: {
    name: '南开大学津南校区 · OSM 白模导入',
    status: 'osm-import',
    source: `OSM import from ${collection.generated_at}; geometry needs campus-side verification before publication.`,
    bounds
  },
  buildings,
  roads,
  greens,
  pois
}

const sourceCode = `/** Auto-generated from OSM review data. Do not manually edit. */\nimport type { CampusSeed } from './jinnan-seed'\n\nexport const campusModel: CampusSeed = ${JSON.stringify(model, null, 2)}\n`
await writeFile(output, sourceCode, 'utf8')
const manifest = {
  generated_at: new Date().toISOString(),
  source: collection.source,
  source_generated_at: collection.generated_at,
  campus_boundary_osm_way: boundary.properties.osm_id,
  status: 'osm-imported-needs-campus-verification',
  counts: { buildings: buildings.length, roads: roads.length, landscapes: greens.length, pois: pois.length },
  bounds_meters: bounds,
  excluded: { nonCampusFeatures: collection.features.length - buildingFeatures.length - roads.length - greens.length - 1 }
}
await writeFile(resolve('data', 'jinnan-model-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
console.log(`Built OSM white model: ${buildings.length} buildings, ${roads.length} roads, ${greens.length} landscape areas, ${pois.length} POIs.`)
