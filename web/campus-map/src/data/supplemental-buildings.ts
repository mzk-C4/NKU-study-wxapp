import type { Building, Point } from './jinnan-seed'

// 根据用户提供的卫星俯视图与现有路网对齐；不是实测轮廓，楼高使用附近白模尺度。
// 独立保存，避免刷新 OSM 导入时丢失这些人工补绘建筑。
export const SUPPLEMENTAL_FRAMES = {
  tourism: { x: 457, z: -977, angle: Math.atan2(39.3, 114.47) },
  government: { x: 814, z: -1036, angle: Math.atan2(17.56, 62.7) },
  dormitory1: { x: 950, z: -1117, angle: Math.atan2(33.67, 123.48) },
}
type Frame = { x: number; z: number; angle: number }
type Block = [number, number, number, number, number]
function rectangle(frame: Frame, x0: number, x1: number, z0: number, z1: number): Point[] {
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => [
    Number((frame.x + x * Math.cos(frame.angle) - z * Math.sin(frame.angle)).toFixed(2)),
    Number((frame.z + x * Math.sin(frame.angle) + z * Math.cos(frame.angle)).toFixed(2)),
  ])
}
function building(id: string, name: string, aliases: string[], category: Building['category'], frame: Frame, envelope: [number, number, number, number], blocks: Block[]): Building {
  return {
    id, name, aliases, category, height: Math.max(...blocks.map(block => block[4])),
    footprint: rectangle(frame, ...envelope),
    volumes: blocks.map(([x0, x1, z0, z1, height]) => ({ footprint: rectangle(frame, x0, x1, z0, z1), height })),
    zone: '北部 · 西部校区', verified: 'user-reference',
  }
}
export const SUPPLEMENTAL_BUILDINGS: Building[] = [
  building('reference-building-tourism', '旅游与服务学院', ['旅游学院', '旅游与服务学院'], 'academic', SUPPLEMENTAL_FRAMES.tourism, [-45, 45, -44, 44], [
    [-45, 45, -44, -28, 18], // 北翼
    [-45, -29, -28, 28, 18], // 西翼
    [-45, 29, 28, 44, 18], // 南翼
    [29, 45, -28, 19, 18], // 东翼与东侧入口缺口
    [29, 45, 25, 44, 18],
    [-3, 29, -2, 19, 10.8], // 内院东侧向内突出的较低体量
  ]),
  building('reference-building-government', '周恩来政府管理学院', ['政府管理学院', '周政', '周恩来政府管理学院'], 'academic', SUPPLEMENTAL_FRAMES.government, [-48, 35, -38, 38], [
    [-32, 35, -38, -18, 21.6], // 四周围合主楼
    [18, 35, -18, 38, 21.6],
    [-32, 18, 19, 38, 18],
    [-32, -15, -18, 19, 21.6],
    [-48, -32, -12, 12, 7.2], // 西侧入口前厅
    [-12, 12, -9, 13, 4.2], // 俯视图中央低矮的方形中庭采光体量
  ]),
  building('reference-building-dormitory-1', '学生宿舍1', ['文科学生宿舍1', '学1', '学生宿舍1A', '学生宿舍1B'], 'residence', SUPPLEMENTAL_FRAMES.dormitory1, [-72, 72, -44, 44], [
    [-72, -32, -44, -28, 27], // 西部 L 形：北侧短翼、西翼、南侧长翼
    [-72, -57, -28, 44, 27],
    [-57, 8, 27, 44, 27],
    [-25, 72, -44, -28, 27], // 东部反向 U 形：长北翼、东翼、南侧短翼
    [57, 72, -28, 44, 27],
    [18, 57, 27, 44, 27],
    [6, 15, -28, -23, 10.8], // 内院小入口体量；保持北侧及南侧通道敞开
    [-12, -3, 22, 27, 10.8],
  ]),
]
