// 技能等级：后端系统配置 app.esports.skill_levels 驱动，配置顺序即高低序。
// App 启动时拉取一次进响应式缓存；等级文案统一走 skillLevelText，
// 拉取失败或编码不在配置（含失效档）时原样回显编码。

import { ref } from 'vue';
import { request } from '../api/request';

export interface SkillLevel {
  code: string;
  name: string;
  rank: number;
}

const levels = ref<SkillLevel[]>([]);
let loaded = false;

export function skillLevelList() {
  return levels;
}

export async function loadSkillLevels(force = false): Promise<SkillLevel[]> {
  if (loaded && !force) return levels.value;
  loaded = true;
  try {
    const data = await request<{ items: SkillLevel[] }>({
      url: '/skill-levels',
      auth: false,
    });
    levels.value = data?.items ?? [];
  } catch {
    levels.value = [];
  }
  return levels.value;
}

export function skillLevelText(code?: string | null): string {
  if (!code) return '';
  return levels.value.find((item) => item.code === code)?.name ?? code;
}

/** 等级序数（配置顺序）；编码不在配置按 -1（低于一切有效档）。 */
export function skillLevelRank(code?: string | null): number {
  const hit = levels.value.find((item) => item.code === code);
  return hit ? hit.rank : -1;
}
