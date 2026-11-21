#!/usr/bin/env node
/**
 * 把某个 worktree 的共享包同步到其余 worktree。
 *
 * 用法：
 *   node scripts/sync-shared.mjs --from=master
 *   node scripts/sync-shared.mjs --from=customer --dry-run
 *
 * 规则：
 * - 复制 `packages/esports-shared/src` 下的全部文件（跳过 node_modules / dist）；
 * - `src/utils/format.ts` 允许按端差异，不覆盖；
 * - 目标分支多出的文件会被删除，保证四份文件集合一致；
 * - 默认 dry-run 关闭，执行前会打印将改动的文件。
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BRANCHES = ['cs', 'customer', 'player', 'master'];
const PKG_DIR = 'packages/esports-shared';
const ALLOW_DIFF = new Set(['utils/format.ts']);

const args = process.argv.slice(2);
const fromArg = args.find((a) => a.startsWith('--from='));
const source = fromArg ? fromArg.slice('--from='.length) : 'master';
const dryRun = args.includes('--dry-run');

if (!BRANCHES.includes(source)) {
  console.error(`未知来源分支：${source}（可选：${BRANCHES.join(' / ')}）`);
  process.exit(1);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');

function walk(dir, base = dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    const rel = relative(base, full).split('\\').join('/');
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push(rel);
  }
  return out;
}

const sourceDir = join(repoRoot, source, PKG_DIR, 'src');
if (!existsSync(sourceDir)) {
  console.error(`来源不存在：${sourceDir}`);
  process.exit(1);
}
const files = walk(sourceDir);

for (const branch of BRANCHES) {
  if (branch === source) continue;
  const targetDir = join(repoRoot, branch, PKG_DIR, 'src');
  if (!existsSync(join(repoRoot, branch))) {
    console.log(`跳过不存在的 worktree：${branch}`);
    continue;
  }
  for (const file of files) {
    if (ALLOW_DIFF.has(file)) continue;
    const dest = join(targetDir, file);
    const exists = existsSync(dest);
    if (!dryRun) {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(join(sourceDir, file), dest);
    }
    console.log(`${dryRun ? '[dry] ' : ''}${exists ? '更新' : '新增'} ${branch}/${file}`);
  }
  // 删除目标分支多余文件，保证文件集合一致。
  for (const file of walk(targetDir)) {
    if (files.includes(file) || ALLOW_DIFF.has(file)) continue;
    const dest = join(targetDir, file);
    if (!dryRun) rmSync(dest);
    console.log(`${dryRun ? '[dry] ' : ''}删除 ${branch}/${file}`);
  }
}
console.log(`\n同步完成：来源 ${source}，${dryRun ? '（dry-run 未写入）' : '已写入'}`);
