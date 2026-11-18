/**
 * `qianchuan-plan-copy` skill provider.
 *
 * Ships the 千川「乘方计划复制」skill inside this bundle: the body lives in
 * `../assets/SKILL.md`, and the scripts / references it mentions live beside it
 * under `../assets/`, which is also the skill's resource base.
 *
 * @module qianchuan-plan-copy
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// 内置技能档位的 rank；不 import @deepseek-ai/dsh-skill —— 该包不在 profile 的
// node_modules 里，从本地目录安装时会 ERR_MODULE_NOT_FOUND。
const BUNDLED_SKILL_RANK = 600

const PROVIDER_NAME = 'qianchuan-plan-copy'
const SKILL_NAME = 'qianchuan-plan-copy'
const SKILL_BODY_URL = new URL('../assets/SKILL.md', import.meta.url)
const RESOURCE_BASE = {
  kind: 'directory',
  path: fileURLToPath(new URL('../assets/', import.meta.url)),
}

const INVOCATION = { modelInvocable: true, userInvocable: true }

const DESCRIPTION = '巨量千川「乘方-推商品-自选商品」计划的复制流程。乘方计划按「商品×抖音号」唯一、平台没有复制按钮，所谓复制 = 搜索原计划 → 抓全部参数 → 用户确认后删除 → 按参数重建 → 逐抖音号全选主页素材 → 核对。当用户给出一个千川计划 ID 并要求「复制这条计划」「重建计划」「改 ROI 后复制」时使用本技能。内含已验证的 CDP 驱动脚本（cdp.mjs / gen-batch11.mjs / pick-all.mjs）、坐标坑、弹窗处理、删除前强制自查与确认规则。'

const CANDIDATE = {
  name: SKILL_NAME,
  description: DESCRIPTION,
  invocation: INVOCATION,
  provider: PROVIDER_NAME,
  source: 'bundled',
  resourceBase: RESOURCE_BASE,
  rank: BUNDLED_SKILL_RANK,
  locator: SKILL_BODY_URL,
}

const provider = {
  name: PROVIDER_NAME,
  list: () => Promise.resolve([CANDIDATE]),
  async get() {
    return {
      name: CANDIDATE.name,
      description: CANDIDATE.description,
      invocation: CANDIDATE.invocation,
      provider: CANDIDATE.provider,
      source: CANDIDATE.source,
      resourceBase: RESOURCE_BASE,
      content: await readFile(SKILL_BODY_URL, 'utf8'),
    }
  },
}

/** Cordis plugin name. */
export const name = 'qianchuan-plan-copy'
/** Service required by this provider. */
export const inject = ['skills']

/** Register the bundled `qianchuan-plan-copy` skill on `ctx.skills`. */
export function apply(ctx) {
  ctx.skills.registerProvider(() => provider)
}
