#!/usr/bin/env node
/**
 * prebuild 入口：本地缺包时调用仓库根 scripts/prepare_web_offline.sh；
 * Docker/Alpine 等环境若 public/offline 已就绪则直接跳过（无需 bash）。
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const zipPath = path.join(webRoot, 'public/offline/bible_offline.zip');
const manifestPath = path.join(webRoot, 'public/offline/manifest.json');
const wasmDir = path.join(webRoot, 'public/sql-wasm');

function ensureSqlWasm() {
  const wasmOut = path.join(wasmDir, 'sql-wasm.wasm');
  const jsOut = path.join(wasmDir, 'sql-wasm.js');
  if (existsSync(wasmOut) && existsSync(jsOut)) return true;

  const dist = path.join(webRoot, 'node_modules/sql.js/dist');
  const wasmSrc = path.join(dist, 'sql-wasm.wasm');
  const jsSrc = path.join(dist, 'sql-wasm.js');
  if (!existsSync(wasmSrc) || !existsSync(jsSrc)) return false;

  mkdirSync(wasmDir, { recursive: true });
  copyFileSync(wasmSrc, wasmOut);
  copyFileSync(jsSrc, jsOut);
  console.log('✓ 已从 node_modules 复制 sql-wasm');
  return true;
}

const hasPack = existsSync(zipPath) && existsSync(manifestPath);
if (hasPack && ensureSqlWasm()) {
  console.log('✓ 离线经包已在 public/，跳过 prepare');
  process.exit(0);
}

const repoScript = path.resolve(webRoot, '../../scripts/prepare_web_offline.sh');
if (!existsSync(repoScript)) {
  console.error(
    '❌ 离线经包缺失，且无法找到 ../../scripts/prepare_web_offline.sh。\n' +
      '   Docker 构建请确保 apps/web/public/offline/ 与 sql-wasm/ 已提交到仓库。',
  );
  process.exit(1);
}

const bash = spawnSync('bash', [repoScript], { stdio: 'inherit', cwd: webRoot });
process.exit(bash.status ?? 1);
