import type { Building, Point } from './jinnan-seed'

// 按用户要求移到图书馆前横向步道南侧；尺寸为导览模型近似值，非实测。
export const ZHOU_ENLAI_STATUE_SITE = { x: 1208, z: -386, yaw: -Math.atan2(7.45, 91.54), height: 6.50 }
export const ZHOU_ENLAI_STATUE_ID = 'reference-monument-zhou-enlai'
export const ZHOU_ENLAI_INSCRIPTION = '我是爱南开的'
const { x, z, yaw } = ZHOU_ENLAI_STATUE_SITE
const footprint: Point[] = [[-2.9, -2.6], [2.9, -2.6], [2.9, 2.6], [-2.9, 2.6]].map(([dx, dz]) => [
  x + dx * Math.cos(yaw) + dz * Math.sin(yaw), z - dx * Math.sin(yaw) + dz * Math.cos(yaw),
])
export const ZHOU_ENLAI_STATUE_BUILDING: Building = {
  id: ZHOU_ENLAI_STATUE_ID, name: '周总理雕像',
  aliases: ['周总理', '周恩来', '周恩来雕像', '周恩来塑像', '周恩来铜像', '图书馆前雕像', ZHOU_ENLAI_INSCRIPTION],
  category: 'landmark', height: ZHOU_ENLAI_STATUE_SITE.height, footprint,
  zone: '中央公共区', verified: 'user-reference',
}
