#!/usr/bin/env node
// 结单服务凭证接线回归检查（§3.4-03）：
// 后端要求「订单有图片凭证时，结单必须回传覆盖全部 evidence_attachment_ids 的
// viewed_evidence_attachment_ids，缺一即 400」。本脚本按源码做机械校验，防止后续改动
// 把「移动客服端结单一律 400」的问题重新引回来。
//
// 运行：node scripts/check-close-evidence.mjs（或 npm run check:close-evidence）
// 退出码：0 = 通过；1 = 有缺项（逐条打印缺失项）。

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// 接口实现已迁入共享包（本端 src/api/cs.ts 只是薄转发），检查对象改为真实实现文件。
const csApi = readFileSync(
  join(root, '..', 'packages/esports-shared/src/api/cs.ts'),
  'utf8'
);
const csPage = readFileSync(join(root, 'src/pages/cs/order-detail.vue'), 'utf8');

const checks = [
  {
    name: 'api/cs.ts：closeOrder 声明 viewed_evidence_attachment_ids 可选入参',
    ok: /viewedEvidenceAttachmentIds\?:\s*number\[\]/.test(csApi),
  },
  {
    name: 'api/cs.ts：closeOrder 请求体带 viewed_evidence_attachment_ids',
    ok: /viewed_evidence_attachment_ids\s*:/.test(csApi),
  },
  {
    name: 'api/cs.ts：结单表单视图暴露 evidence_attachment_ids',
    ok: /evidence_attachment_ids\?:\s*number\[\]/.test(csApi),
  },
  {
    name: 'api/cs.ts：提供附件访问地址解析（resolveCsAttachmentUrl）',
    ok: /export\s+async\s+function\s+resolveCsAttachmentUrl/.test(csApi),
  },
  {
    name: 'pages/cs/order-detail.vue：读取 close-form 的 evidence_attachment_ids',
    ok: /evidence_attachment_ids/.test(csPage),
  },
  {
    name: 'pages/cs/order-detail.vue：调用 closeOrder 时传入已查看凭证 ID 列表',
    ok: /closeOrder\([\s\S]{0,400}?evidenceIds\.value/.test(csPage),
  },
];

const failed = checks.filter((item) => !item.ok);
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}`);
}
if (failed.length > 0) {
  console.error(`\n结单服务凭证接线检查未通过：${failed.length} 项缺失`);
  process.exit(1);
}
console.log('\n结单服务凭证接线检查通过');
