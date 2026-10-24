import type { CampusSeed, Point } from './data/jinnan-seed'
import { createUniformPineGroup, inTreePolygon, PINE_MODEL } from './eastern-row-trees'
import { ROAD_PROFILE, roadEdgePoints, roadStripPolygons } from './road-profile'

type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number }
const borderScale = (ROAD_PROFILE.edgeScale + ROAD_PROFILE.surfaceScale) / 2
export const WEST_ROAD_TREE_LAYOUT = { maxX: 1410, spacing: 22, offset: ROAD_PROFILE.halfWidth.primary * borderScale, buildingClearance: Math.max(3.6, PINE_MODEL.canopyRadius) + 1.5 }
// 用户指定清空图书馆北侧、两组教学/实验楼南侧的日新道路段；不影响同名路的其他路段。
export const TREE_FREE_ROAD_IDS = ['osm-road-477379218-1']
type Site = { point: Point; roadId: string; side: -1 | 1; distance: number }

function distanceToSegment(point: Point, a: Point, b: Point) {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz)
}
function inBounds([x, z]: Point, b: Bounds, pad = 0) { return x >= b.minX - pad && x <= b.maxX + pad && z >= b.minZ - pad && z <= b.maxZ + pad }

export function getWestRoadTreeSites(model: CampusSeed, renderedBuildings: Bounds[] = [], reserved: Bounds[] = []) {
  const { spacing, buildingClearance, maxX } = WEST_ROAD_TREE_LAYOUT
  // 原始轮廓和实际精细模型都检查，屋檐、外楼梯和突出入口也有安全距离。
  const footprints = model.buildings.map(building => ({ minX: Math.min(...building.footprint.map(p => p[0])), maxX: Math.max(...building.footprint.map(p => p[0])), minZ: Math.min(...building.footprint.map(p => p[1])), maxZ: Math.max(...building.footprint.map(p => p[1])) }))
  const buildings = [...footprints, ...renderedBuildings]
  const roadMasks = model.roads.flatMap(road => roadStripPolygons(road, ROAD_PROFILE.surfaceScale)).map(polygon => ({ polygon, minX: Math.min(...polygon.map(p => p[0])) - .8, maxX: Math.max(...polygon.map(p => p[0])) + .8, minZ: Math.min(...polygon.map(p => p[1])) - .8, maxZ: Math.max(...polygon.map(p => p[1])) + .8 }))
  const protectedAreas = model.greens.filter(area => area.kind === 'water' || area.kind === 'plaza' || /球场|运动|跑道/.test(area.name))
  const sites: Site[] = []
  const counts: Record<string, number> = { buildings: 0, intersections: 0, surfaces: 0, duplicate: 0 }
  for (const road of model.roads.filter(road => road.kind === 'primary' && road.points.some(p => p[0] < maxX))) {
    if (road.points.length < 2) continue
    const border = roadEdgePoints(road, borderScale)
    const outer = roadStripPolygons(road, ROAD_PROFILE.edgeScale)
    const lengths = [0]
    for (let i = 1; i < road.points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(road.points[i][0] - road.points[i - 1][0], road.points[i][1] - road.points[i - 1][1]))
    const total = lengths[lengths.length - 1]
    function at(distance: number, side: -1 | 1): Point {
      const clamped = Math.max(0, Math.min(total, distance))
      let index = 1
      while (index < lengths.length - 1 && lengths[index] < clamped) index++
      const t = (clamped - lengths[index - 1]) / (lengths[index] - lengths[index - 1] || 1)
      const edgeIndex = side === 1 ? 0 : 1
      const a = border[index - 1][edgeIndex], b = border[index][edgeIndex]
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }
    for (let distance = 12; distance <= total - 12; distance += spacing) {
      for (const side of [-1, 1] as const) {
        const point = at(distance, side)
        if (!outer.some(polygon => inTreePolygon(point, polygon))) continue
        if (point[0] >= maxX || point[0] < model.meta.bounds.minX || point[1] < model.meta.bounds.minZ || point[1] > model.meta.bounds.maxZ) continue
        if (buildings.some(bounds => inBounds(point, bounds, buildingClearance))) { counts.buildings++; continue }
        if (reserved.some(bounds => inBounds(point, bounds, Math.max(3.6, PINE_MODEL.canopyRadius)))) { counts.surfaces++; continue }
        // 树干落在深棕色边带；任何道路的浅色路面与路口都保留，不按树冠宽度外推树排。
        if (roadMasks.some(mask => inBounds(point, mask) && (inTreePolygon(point, mask.polygon) || mask.polygon.some((p, i) => distanceToSegment(point, p, mask.polygon[(i + 1) % mask.polygon.length]) < .8)))) { counts.intersections++; continue }
        if (protectedAreas.some(area => inTreePolygon(point, area.polygon) || area.polygon.some((p, i) => distanceToSegment(point, p, area.polygon[(i + 1) % area.polygon.length]) < 5))) { counts.surfaces++; continue }
        // 避免双向道路的两条数据线、短路段接缝或邻近道路重复放树。
        if (sites.some(site => Math.hypot(site.point[0] - point[0], site.point[1] - point[1]) < 15)) { counts.duplicate++; continue }
        sites.push({ point, roadId: road.id, side, distance })
      }
    }
  }
  // 排列完成后再移除指定路段，避免邻近道路因去重顺序变化而新增或移动树。
  return { sites: sites.filter(site => !TREE_FREE_ROAD_IDS.includes(site.roadId)), skipped: counts }
}

export function createWestRoadTrees(model: CampusSeed, renderedBuildings: Bounds[] = [], reserved: Bounds[] = []) {
  const { sites, skipped } = getWestRoadTreeSites(model, renderedBuildings, reserved)
  const group = createUniformPineGroup(sites.map(site => site.point), '西区主干道两侧松树')
  group.position.y = ROAD_PROFILE.edgeHeight
  Object.assign(group.userData.layout, { sites, skipped, scope: 'west-primary-roads', placement: 'dark-road-border', spacing: WEST_ROAD_TREE_LAYOUT.spacing, offset: WEST_ROAD_TREE_LAYOUT.offset, buildingClearance: WEST_ROAD_TREE_LAYOUT.buildingClearance })
  return group
}
