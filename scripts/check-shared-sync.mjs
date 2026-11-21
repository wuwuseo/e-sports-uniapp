#!/usr/bin/env node
/**
 * 校验四个 worktree 的共享包内容一致。
 *
 * 背景：`packages/esports-shared` 在 cs / customer / player / master 四个 worktree
 * 各存一份（同一仓库的四个分支）。靠人工复制同步已经漂移过，这里用内容哈希兜底：
 * 任何一份改动没同步到其余分支，pre-push 钩子会直接拦住推送。
 *
 * 用法：node scripts/check-shared-sync.mjs
 * 退出码：0 一致（或仅允许的按端差异），1 存在漂移。
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BRANCHES = ['cs', 'customer', 'player', 'master'];
const PKG_DIR = 'packages/esports-shared';

// 允许按端差异的文件：同一个订单状态对不同角色是不同话术（"待客户确认" vs
// "待你确认陪玩"），属于产品语义而非漂移，不参与一致性校验。
const ALLOW_DIFF = new Set(['utils/format.ts']);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');

function walk(dir, base = dir) {
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    const rel = relative(base, full).split('\\').join('/');
    if (statSync(full).isDirectory()) {
      for (const [k, v] of walk(full, base)) out.set(k, v);
    } else {
      out.set(rel, createHash('sha256').update(readFileSync(full)).digest('hex'));
    }
  }
  return out;
}

const snapshots = new Map();
const missing = [];
for (const branch of BRANCHES) {
  const dir = join(repoRoot, branch, PKG_DIR, 'src');
  if (!existsSync(dir)) {
    missing.push(branch);
    continue;
  }
  snapshots.set(branch, walk(dir));
}
if (missing.length) {
  console.log(`[shared-sync] 跳过不存在的 worktree：${missing.join(', ')}`);
}
if (snapshots.size < 2) {
  console.log('[shared-sync] 少于两个 worktree，跳过校验');
  process.exit(0);
}

const allFiles = new Set();
for (const files of snapshots.values()) {
  for (const f of files.keys()) allFiles.add(f);
}

let drift = 0;
for (const file of [...allFiles].sort()) {
  if (ALLOW_DIFF.has(file)) continue;
  const hashes = new Map();
  for (const [branch, files] of snapshots) {
    hashes.set(branch, files.get(file) ?? '(缺失)');
  }
  const unique = new Set(hashes.values());
  if (unique.size > 1) {
    drift += 1;
    console.log(`\n[drift] ${file}`);
    for (const [branch, hash] of hashes) {
      console.log(`  ${branch.padEnd(9)} ${hash.slice(0, 8)}`);
    }
  }
}

if (drift > 0) {
  console.error(
    `\n[shared-sync] 发现 ${drift} 个共享包文件在四个 worktree 间不一致。` +
      `\n执行 node scripts/sync-shared.mjs --from=<cs|customer|player|master> 同步后再推送。`
  );
  process.exit(1);
}
console.log(
  `[shared-sync] 通过：${allFiles.size} 个文件在 ${snapshots.size} 个 worktree 间一致` +
    `（跳过按端差异 ${ALLOW_DIFF.size} 个）`
);
