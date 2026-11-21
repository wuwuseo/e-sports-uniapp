#!/usr/bin/env node
/**
 * 安装共享包一致性校验的 pre-push 钩子。
 *
 * 钩子文件在 `.git/hooks` 下，不随仓库分发，所以新 clone / 新 worktree 需要执行一次：
 *   node scripts/install-shared-hook.mjs
 *
 * 钩子内容与下面的 HOOK 常量保持一致；重复执行只会覆盖本脚本安装的版本，
 * 若检测到别的 pre-push（例如 husky），先备份为 pre-push.bak 再写入。
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = `#!/bin/sh
# 共享包四副本一致性校验（由 scripts/install-shared-hook.mjs 安装）
top=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -n "$top" ] && [ -f "$top/scripts/check-shared-sync.mjs" ] && command -v node >/dev/null 2>&1; then
  node "$top/scripts/check-shared-sync.mjs" || {
    echo "" >&2
    echo "已阻止推送：共享包四副本不一致。" >&2
    echo "先执行 node scripts/sync-shared.mjs --from=<cs|customer|player|master>，提交后再推送。" >&2
    exit 1
  }
fi
`;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const commonDir = execSync('git rev-parse --git-common-dir', {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();
const hooksDir = resolve(repoRoot, commonDir, 'hooks');
const hookPath = join(hooksDir, 'pre-push');

mkdirSync(hooksDir, { recursive: true });

if (existsSync(hookPath)) {
  const current = readFileSync(hookPath, 'utf8');
  if (current !== HOOK) {
    writeFileSync(`${hookPath}.bak`, current);
    console.log(`已备份原有 pre-push 到 ${hookPath}.bak`);
  }
}

writeFileSync(hookPath, HOOK);
chmodSync(hookPath, 0o755);
console.log(`已安装 pre-push 钩子：${hookPath}`);
