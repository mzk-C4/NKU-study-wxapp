import type { Point, Road } from './data/jinnan-seed'

export const ROAD_PROFILE = { halfWidth: { primary: 11, secondary: 7, walkway: 2.8 }, edgeScale: 1.18, surfaceScale: .72, edgeHeight: .64 }

// 渲染和种树共用同一套边线，包括转角处相邻顶点的平均方向。
export function roadEdgePoints(road: Road, scale: number) {
  const halfWidth = ROAD_PROFILE.halfWidth[road.kind] * scale
  return road.points.map(([x, z], index) => {
    const previous = road.points[Math.max(0, index - 1)]
    const next = road.points[Math.min(road.points.length - 1, index + 1)]
    const dx = next[0] - previous[0], dz = next[1] - previous[1]
    const length = Math.hypot(dx, dz) || 1
    const ox = -dz / length * halfWidth, oz = dx / length * halfWidth
    return [[x + ox, z + oz], [x - ox, z - oz]] as [Point, Point]
  })
}

export function roadStripPolygons(road: Road, scale: number): Point[][] {
  const edges = roadEdgePoints(road, scale)
  return edges.slice(1).flatMap(([left, right], i) => [
    [edges[i][0], left, edges[i][1]], [edges[i][1], left, right]
  ])
}
