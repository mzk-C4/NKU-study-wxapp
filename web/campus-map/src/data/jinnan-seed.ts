/**
 * Seed geometry for renderer and performance testing only.
 * It is deliberately marked as unverified: do not publish or navigate with it.
 * Replace it with reviewed OSM/official-source geometry before any public release.
 */

export type Point = readonly [number, number]
export type BuildingCategory = 'academic' | 'library' | 'service' | 'residence' | 'sport' | 'landmark'

export interface Building {
  id: string
  name: string
  aliases: string[]
  category: BuildingCategory
  height: number
  footprint: Point[]
  // 用户俯视参考补绘的复合体量；footprint 是选址包络，实际白模只挤出这些翼楼。
  volumes?: { footprint: Point[]; height: number }[]
  zone: string
  verified: 'seed' | 'osm-import' | 'user-reference'
}

export interface Road {
  id: string
  name: string
  kind: 'primary' | 'secondary' | 'walkway'
  points: Point[]
}

export interface Area {
  id: string
  name: string
  polygon: Point[]
  kind: 'green' | 'water' | 'plaza'
}

export interface Poi {
  id: string
  name: string
  type: 'gate' | 'transport' | 'service'
  position: Point
}

export interface CampusSeed {
  meta: {
    name: string
    status: 'seed-only' | 'osm-import'
    source: string
    bounds: { minX: number, maxX: number, minZ: number, maxZ: number }
  }
  buildings: Building[]
  roads: Road[]
  greens: Area[]
  pois: Poi[]
}

const rectangle = (x: number, z: number, width: number, depth: number): Point[] => [
  [x, z], [x + width, z], [x + width, z + depth], [x, z + depth]
]

const clustered = (
  prefix: string,
  zone: string,
  x: number,
  z: number,
  columns: number,
  rows: number,
  label: string,
  category: BuildingCategory,
  seed = 0
): Building[] => Array.from({ length: columns * rows }, (_, index) => {
  const column = index % columns
  const row = Math.floor(index / columns)
  const width = 72 + ((index + seed) % 3) * 16
  const depth = 46 + ((index * 3 + seed) % 3) * 12
  return {
    id: `${prefix}-${String(index + 1).padStart(2, '0')}`,
    name: `${label} ${String(index + 1).padStart(2, '0')}`,
    aliases: [label],
    category,
    height: 20 + ((index + seed) % 5) * 6,
    footprint: rectangle(x + column * 126, z + row * 102, width, depth),
    zone,
    verified: 'seed'
  }
})

const highlights: Building[] = [
  { id: 'law-school', name: '法学院（待核验位置）', aliases: ['法学院', '法学楼'], category: 'landmark', height: 38, footprint: rectangle(330, 905, 196, 92), zone: '文科组团', verified: 'seed' },
  { id: 'library', name: '津南校区图书馆（待核验位置）', aliases: ['图书馆', '图书馆主楼'], category: 'library', height: 45, footprint: rectangle(1120, 805, 214, 116), zone: '中央公共区', verified: 'seed' },
  { id: 'service-centre', name: '综合业务楼（待核验位置）', aliases: ['师生服务大厅', '综合业务楼'], category: 'service', height: 28, footprint: rectangle(775, 728, 142, 74), zone: '中央公共区', verified: 'seed' },
  { id: 'activity-centre', name: '学生活动中心（待核验位置）', aliases: ['活动中心'], category: 'service', height: 26, footprint: rectangle(970, 540, 158, 82), zone: '中央公共区', verified: 'seed' },
  { id: 'sports-centre', name: '体育中心（待核验位置）', aliases: ['体育馆', '运动中心'], category: 'sport', height: 25, footprint: rectangle(1520, 386, 208, 105), zone: '体育运动区', verified: 'seed' },
  { id: 'west-gate-hall', name: '西门服务节点（待核验位置）', aliases: ['西门'], category: 'service', height: 16, footprint: rectangle(175, 680, 82, 45), zone: '西入口', verified: 'seed' },
  { id: 'north-gate-hall', name: '北门服务节点（待核验位置）', aliases: ['北门'], category: 'service', height: 16, footprint: rectangle(1170, 1405, 92, 48), zone: '北入口', verified: 'seed' }
]

export const campusSeed: CampusSeed = {
  meta: {
    name: '南开大学津南校区 · 白模实验数据',
    status: 'seed-only' as const,
    source: 'Procedural seed geometry for feasibility testing; not for public navigation.',
    bounds: { minX: 0, maxX: 2200, minZ: 0, maxZ: 1600 }
  },
  buildings: [
    ...highlights,
    ...clustered('humanities', '文科组团', 320, 1085, 4, 3, '文科教学组团', 'academic', 1),
    ...clustered('science', '理工组团', 1400, 1055, 4, 3, '理工教学组团', 'academic', 2),
    ...clustered('residence-east', '学生生活区', 1510, 650, 4, 4, '学生公寓', 'residence', 3),
    ...clustered('residence-south', '学生生活区', 810, 180, 5, 3, '学生公寓', 'residence', 4),
    ...clustered('teaching', '中央公共区', 670, 870, 3, 2, '公共教学楼', 'academic', 5),
    ...clustered('service-west', '西部服务区', 300, 400, 3, 2, '服务配套楼', 'service', 6),
    ...clustered('research-east', '东部科研区', 1760, 1050, 2, 3, '科研楼', 'academic', 7)
  ],
  roads: [
    { id: 'tongyan', name: '同砚路（示意）', kind: 'primary', points: [[0, 1430], [450, 1430], [850, 1400], [1300, 1410], [1800, 1430], [2200, 1410]] },
    { id: 'central-avenue', name: '中央大道（示意）', kind: 'primary', points: [[1070, 1560], [1080, 1260], [1080, 1010], [1100, 750], [1090, 480], [1100, 40]] },
    { id: 'north-loop', name: '北区环路（示意）', kind: 'secondary', points: [[220, 1180], [600, 1215], [990, 1180], [1430, 1190], [1960, 1150]] },
    { id: 'south-loop', name: '南区环路（示意）', kind: 'secondary', points: [[220, 380], [640, 390], [1050, 420], [1420, 390], [1900, 420]] },
    { id: 'west-east', name: '东西步行轴（示意）', kind: 'walkway', points: [[110, 760], [430, 770], [730, 770], [1100, 760], [1450, 780], [2050, 760]] },
    { id: 'library-walk', name: '图书馆步行轴（示意）', kind: 'walkway', points: [[730, 920], [920, 900], [1100, 870], [1330, 865], [1520, 900]] },
    { id: 'west-entry', name: '西入口道路（示意）', kind: 'secondary', points: [[0, 700], [210, 700], [430, 705], [690, 720]] },
    { id: 'east-entry', name: '东入口道路（示意）', kind: 'secondary', points: [[2200, 710], [1990, 720], [1760, 735], [1510, 750]] }
  ],
  greens: [
    { id: 'west-garden', name: '西园（示意）', kind: 'green', polygon: rectangle(80, 900, 220, 260) },
    { id: 'central-garden', name: '中央草坪（示意）', kind: 'green', polygon: rectangle(930, 990, 300, 176) },
    { id: 'east-garden', name: '东部绿地（示意）', kind: 'green', polygon: rectangle(1830, 650, 240, 300) },
    { id: 'south-garden', name: '南部景观绿地（示意）', kind: 'green', polygon: rectangle(300, 90, 390, 225) },
    { id: 'science-garden', name: '理工绿地（示意）', kind: 'green', polygon: rectangle(1400, 1320, 360, 120) },
    { id: 'campus-water', name: '景观水面（示意）', kind: 'water', polygon: rectangle(1260, 580, 200, 76) },
    { id: 'library-plaza', name: '图书馆广场（示意）', kind: 'plaza', polygon: rectangle(1030, 720, 410, 68) },
    { id: 'central-plaza', name: '中央广场（示意）', kind: 'plaza', polygon: rectangle(820, 625, 220, 64) }
  ],
  pois: [
    { id: 'west-gate', name: '西门（待核验）', type: 'gate', position: [90, 700] },
    { id: 'north-gate', name: '北门（待核验）', type: 'gate', position: [1215, 1490] },
    { id: 'east-gate', name: '东门（待核验）', type: 'gate', position: [2120, 720] },
    { id: 'campus-stop', name: '校内交通点（待核验）', type: 'transport', position: [1080, 760] },
    { id: 'service-desk', name: '师生服务点（待核验）', type: 'service', position: [846, 764] }
  ]
}
