#!/usr/bin/env node
/** 生成圣经知识题库（含主题/人物/地理/串珠题） */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const repo = join(__dir, '..');
const out = join(repo, 'apps/web/data/question_bank.json');
const outLegacy = join(repo, 'data/challenge/question_bank.json');
const topicsPath = join(repo, 'data/topics/topics.json');
const entitiesPath = join(repo, 'data/dictionary/entities.json');

const THEMES = [
  { id: 'gospel', name: '福音核心', refs: ['JHN.3.16', 'ROM.3.23', 'EPH.2.8', 'GAL.2.20', '1CO.15.3'] },
  { id: 'ot_people', name: '旧约人物', refs: ['GEN.12.1', 'EXO.3.10', '1SA.17.49', '1KI.3.9', 'DAN.6.10'] },
  { id: 'nt_letters', name: '新约书信', refs: ['ROM.8.28', '1CO.13.4', 'GAL.5.22', 'EPH.6.10', 'PHP.4.13'] },
  { id: 'sermon', name: '登山宝训', refs: ['MAT.5.3', 'MAT.6.33', 'MAT.7.12', 'MAT.5.14', 'MAT.6.9'] },
  { id: 'psalms', name: '诗篇智慧', refs: ['PSA.23.1', 'PSA.51.10', 'PSA.119.105', 'PSA.46.10', 'PSA.139.14'] },
  { id: 'prophets', name: '先知书', refs: ['ISA.53.5', 'JER.29.11', 'EZK.36.26', 'HOS.6.6', 'MIC.5.2'] },
  { id: 'history', name: '历史书', refs: ['JOS.1.9', 'JDG.6.14', 'RUT.1.16', '2SA.7.16', 'NEH.8.10'] },
  { id: 'law', name: '律法书', refs: ['GEN.1.1', 'EXO.20.3', 'LEV.19.18', 'NUM.6.24', 'DEU.6.5'] },
  { id: 'acts', name: '使徒行传', refs: ['ACT.1.8', 'ACT.2.38', 'ACT.9.3', 'ACT.16.31', 'ACT.17.11'] },
  { id: 'revelation', name: '启示录', refs: ['REV.1.8', 'REV.3.20', 'REV.21.4', 'REV.22.13', 'REV.5.9'] },
  { id: 'crossrefs', name: '经文呼应', refs: ['JHN.3.16', 'ROM.8.28', 'PSA.23.1', 'ISA.53.5', 'MAT.5.3'] },
  { id: 'christology', name: '基督论', refs: ['COL.1.15', 'PHP.2.6', 'HEB.1.3', 'JHN.1.1', '1TI.2.5'] },
];

const BOOK_QA = [
  { q: '「{ref}」位于哪一类书卷？', opts: ['摩西五经', '历史书', '先知书', '新约书信'], a: 3, exp: '对照经节坐标确认书卷分类。' },
  { q: '阅读「{ref}」时，最恰当的方法是？', opts: ['断章取义', '结合上下文', '只看字面', '忽略历史'], a: 1, exp: '解经须上下文与整本圣经光照。' },
  { q: '「{ref}」最常与哪类主题关联？', opts: ['礼仪条例', '救恩与信实', '族谱统计', '建筑细则'], a: 1, exp: '圣经核心信息指向神的救恩。' },
];

const CROSSREF_QA = [
  { q: '「{ref}」常与哪节经文形成主题呼应？', opts: ['{rel}', '创 1:1', '但 12:3', '启 22:21'], a: 0, exp: '串珠显示经文之间的主题关联。' },
];

function loadJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function refDisplay(ref) {
  return ref.replace('.', ' ').replace('.', ':');
}

const questions = [];
const crossJson = loadJson(join(repo, 'data/crossrefs/cross_references.json'));
const crossMap = new Map();
for (const item of crossJson?.references || []) {
  crossMap.set(item.ref?.replace(' ', '.').replace(':', '.'), item.related?.[0]);
}

for (const theme of THEMES) {
  for (let i = 0; i < 40; i++) {
    const ref = theme.refs[i % theme.refs.length];
    const tpl = BOOK_QA[i % BOOK_QA.length];
    questions.push({
      id: `bank-${theme.id}-${i + 1}`,
      theme: theme.name,
      themeId: theme.id,
      question: tpl.q.replace('{ref}', refDisplay(ref)),
      options: [...tpl.opts],
      answer: tpl.a,
      explain: `${tpl.exp}（参考 ${ref}）`,
      ref,
    });
  }
}

// 串珠题
for (let i = 0; i < 80; i++) {
  const ref = CROSSREF_QA[0] ? THEMES[0].refs[i % 5] : 'JHN.3.16';
  const key = ref;
  const rel = crossMap.get(key) || 'ROM.5.8';
  const relDisp = rel.replace(' ', ' ').replace(':', ':');
  questions.push({
    id: `bank-cross-${i + 1}`,
    theme: '经文呼应',
    themeId: 'crossrefs',
    question: `「${refDisplay(ref)}」常与哪节经文形成主题呼应？`,
    options: [relDisp, '创 1:1', '但 12:3', '启 22:21'],
    answer: 0,
    explain: `串珠显示 ${ref} 与 ${rel} 主题相关。`,
    ref,
  });
}

// 主题库题
const topics = loadJson(topicsPath);
for (const t of topics?.topics || []) {
  for (let i = 0; i < 3; i++) {
    const ref = (t.refs || [])[i % (t.refs?.length || 1)];
    if (!ref) continue;
    questions.push({
      id: `bank-topic-${t.id}-${i}`,
      theme: t.name,
      themeId: `topic-${t.id}`,
      question: `「${t.name}」主题的代表经文是？`,
      options: [ref, 'GEN 1:1', 'LEV 11:1', 'NUM 7:1'],
      answer: 0,
      explain: `${t.name} 主题经节之一：${ref}。`,
      ref: ref.replace(' ', '.').replace(':', '.'),
    });
  }
}

// 词典人物/地理
const entities = loadJson(entitiesPath);
for (const e of (entities?.entities || []).slice(0, 200)) {
  if (!e.refs?.length) continue;
  const ref = e.refs[0].replace(' ', '.').replace(':', '.');
  questions.push({
    id: `bank-entity-${e.id}`,
    theme: e.type === 'place' ? '圣经地理' : '旧约人物',
    themeId: e.type === 'place' ? 'places' : 'ot_people',
    question: `「${e.name}」首次重要出现与哪类经文相关？`,
    options: [e.summary?.slice(0, 24) || e.name, '无圣经记载', '仅出现在次经', '新约独有'],
    answer: 0,
    explain: `${e.name}：${e.summary || ''}（${e.refs[0]}）`,
    ref,
  });
}

const payload = JSON.stringify(
  {
    schema: 'question_bank@2',
    source: 'themes + topics + entities + crossrefs',
    count: questions.length,
    themes: THEMES.map((t) => ({ id: t.id, name: t.name })),
    questions,
  },
  null,
  0,
);
mkdirSync(dirname(out), { recursive: true });
mkdirSync(dirname(outLegacy), { recursive: true });
writeFileSync(out, payload);
writeFileSync(outLegacy, payload);
console.log(`Wrote ${questions.length} questions → ${out}`);
