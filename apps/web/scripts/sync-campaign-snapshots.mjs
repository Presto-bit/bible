#!/usr/bin/env node
/**
 * 把邀请码活动站（pages.dev）构建产物抓成本地快照，供 /campaigns/embed 代理直接读盘。
 * 国内服务器连 pages.dev 常 10s+ 或失败；快照随 web 镜像发布，运行时不再依赖上游。
 *
 * 用法（需能访问 pages.dev 的网络）：node scripts/sync-campaign-snapshots.mjs
 * 活动站发版后重跑一次并提交 public/campaign-snapshots。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITES = {
  'hebrews-30': 'https://hebrews-30.pages.dev',
  'genesis-50': 'https://genesis-50.pages.dev',
};

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'campaign-snapshots');
const TEXT_EXT = /\.(?:js|mjs|css|html|json|svg|webmanifest)$/i;
const REF_EXT = 'js|mjs|css|woff2?|ttf|otf|png|jpe?g|webp|gif|svg|ico|json|webmanifest|mp3|m4a';

function collectRefs(text, fromPath) {
  const out = new Set();
  const abs = new RegExp(`["'\`(]\\s*(/[A-Za-z0-9_./-]+\\.(?:${REF_EXT}))(?=[?#"'\`)\\s])`, 'g');
  const assets = new RegExp(`["'\`]((?:\\./)?assets/[A-Za-z0-9_./-]+\\.(?:${REF_EXT}))["'\`]`, 'g');
  const rel = new RegExp(`["'\`(]\\s*(\\.{1,2}/[A-Za-z0-9_./-]+\\.(?:${REF_EXT}))(?=[?#"'\`)\\s])`, 'g');
  for (const m of text.matchAll(abs)) if (!m[1].startsWith('//')) out.add(m[1]);
  for (const m of text.matchAll(assets)) out.add(`/${m[1].replace(/^\.\//, '')}`);
  const dir = path.posix.dirname(fromPath);
  for (const m of text.matchAll(rel)) out.add(path.posix.normalize(path.posix.join(dir, m[1])));
  return out;
}

async function fetchWithRetry(url) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      return res;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function syncSite(site, origin) {
  const dir = path.join(ROOT, site);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });

  const queue = ['/'];
  const seen = new Set(queue);
  let files = 0;
  let bytes = 0;
  const missing = [];

  while (queue.length) {
    const p = queue.shift();
    const res = await fetchWithRetry(new URL(p, origin).toString());
    if (!res.ok) {
      missing.push(`${res.status} ${p}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (p === '/' && !buf.toString('utf8', 0, 64).trimStart().toLowerCase().startsWith('<!doctype')) {
      throw new Error(`${site}: index is not HTML`);
    }
    const file = path.join(dir, p === '/' ? 'index.html' : p.slice(1));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, buf);
    files += 1;
    bytes += buf.length;

    if (p === '/' || TEXT_EXT.test(p)) {
      for (const ref of collectRefs(buf.toString('utf8'), p === '/' ? '/index.html' : p)) {
        if (seen.has(ref) || ref.startsWith('/api/')) continue;
        seen.add(ref);
        queue.push(ref);
      }
    }
  }

  console.log(`[${site}] ${files} files, ${(bytes / 1024).toFixed(0)} KB`);
  if (missing.length) console.log(`[${site}] skipped (not on upstream):\n  ${missing.join('\n  ')}`);
}

for (const [site, origin] of Object.entries(SITES)) {
  await syncSite(site, origin);
}

// 国行系统 WebView 跑不了 type=module。再打一份普通脚本，文件名带站点，供 embed 页替换入口。
const esbuild = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.bin', 'esbuild');
for (const site of Object.keys(SITES)) {
  const assets = path.join(ROOT, site, 'assets');
  const entries = (await fs.readdir(assets)).filter((name) => /^index-.*\.js$/.test(name));
  if (entries.length !== 1) throw new Error(`${site}: expected one index-*.js, got ${entries.join(',')}`);
  const token = site.replace(/-/g, '');
  const out = path.join(assets, `embed-classic-${token}.js`);
  const result = spawnSync(esbuild, [
    path.join(assets, entries[0]),
    '--bundle',
    '--format=iife',
    '--target=chrome64',
    `--outfile=${out}`,
  ], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`[${site}] classic bundle ${path.basename(out)}`);
}
