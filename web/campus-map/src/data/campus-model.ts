import { campusModel as importedModel } from './jinnan-model'
import { SUPPLEMENTAL_BUILDINGS } from './supplemental-buildings'
import { ZHOU_ENLAI_STATUE_BUILDING } from './zhou-enlai-monument'
import type { CampusSeed } from './jinnan-seed'

// 保留原始导入数据，叠加用户确认遗漏的建筑群和图书馆前雕像。
export const campusModel: CampusSeed = {
  ...importedModel,
  meta: { ...importedModel.meta, source: `${importedModel.meta.source} Three supplemental building groups traced from user-provided overhead references and one library forecourt monument approximated from a user photo; heights and monument placement are visual estimates.` },
  buildings: [...importedModel.buildings, ...SUPPLEMENTAL_BUILDINGS, ZHOU_ENLAI_STATUE_BUILDING],
}
