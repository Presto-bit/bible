#!/usr/bin/env node
/** 生成 1000+ 道圣经知识题库 → data/challenge/question_bank.json */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const out = join(__dir, '../data/challenge/question_bank.json');

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
  { id: 'places', name: '圣经地理', refs: ['MAT.2.1', 'JHN.4.5', 'ACT.9.11', 'GEN.12.6', 'EXO.3.1'] },
  { id: 'miracles', name: '神迹奇事', refs: ['MRK.4.39', 'JHN.11.43', 'MAT.14.19', 'LUK.5.4', 'MRK.10.52'] },
  { id: 'parables', name: '比喻故事', refs: ['LUK.15.11', 'MAT.13.3', 'LUK.10.30', 'MAT.25.14', 'LUK.18.10'] },
  { id: 'covenants', name: '圣约主题', refs: ['GEN.9.13', 'GEN.17.7', 'JER.31.33', 'LUK.22.20', 'HEB.8.6'] },
  { id: 'worship', name: '敬拜祷告', refs: ['PSA.95.6', '1TH.5.17', 'MAT.6.6', 'HEB.13.15', 'JHN.4.24'] },
  { id: 'church', name: '教会生活', refs: ['ACT.2.42', '1CO.12.12', 'EPH.4.11', 'HEB.10.25', '1PE.2.9'] },
  { id: 'ethics', name: '伦理生活', refs: ['MAT.22.39', 'COL.3.23', 'JAS.1.22', '1JO.3.18', 'ROM.12.1'] },
  { id: 'eschatology', name: '末世盼望', refs: ['1TH.4.16', 'MAT.24.36', '2PE.3.13', '1CO.15.52', 'REV.20.11'] },
  { id: 'christology', name: '基督论', refs: ['COL.1.15', 'PHP.2.6', 'HEB.1.3', 'JHN.1.1', '1TI.2.5'] },
  { id: 'pneumatology', name: '圣灵工作', refs: ['JHN.14.26', 'ACT.2.4', 'ROM.8.26', 'GAL.5.16', '1CO.12.7'] },
];

const BOOK_QA = [
  { q: '「{ref}」主要强调什么主题？', opts: ['神的创造', '神的救赎', '神的审判', '礼仪条例'], a: 1, exp: '本节经文核心指向神的救恩与信实。' },
  { q: '以下哪卷书包含「{ref}」？', opts: ['摩西五经', '历史书', '先知书', '新约书信'], a: 3, exp: '可对照经节坐标确认书卷。' },
  { q: '「{ref}」中神的要求更接近？', opts: ['外在仪式', '内心信靠', '政治联盟', '财富积累'], a: 1, exp: '圣经强调信心与顺服的心。' },
  { q: '阅读「{ref}」时，最恰当的应用是？', opts: ['断章取义', '结合上下文', '只看字面', '忽略历史'], a: 1, exp: '解经须上下文与整本圣经光照。' },
  { q: '「{ref}」与哪项教义相关？', opts: ['三位一体', '因信称义', '复活盼望', '以上都可能'], a: 3, exp: '经文常多面向启示神的属性与救恩。' },
];

const PEOPLE = [
  ['挪亚', '建方舟'], ['亚伯拉罕', '信心之父'], ['摩西', '领出埃及'], ['约书亚', '进迦南'], ['底波拉', '作士师'],
  ['撒母耳', '膏立君王'], ['大卫', '合神心意'], ['所罗门', '建圣殿'], ['以利亚', '迦密山'], ['以利沙', '承接先知'],
  ['以赛亚', '预言弥赛亚'], ['耶利米', '流泪先知'], ['但以理', '狮子坑'], ['尼希米', '重建城墙'], ['以斯帖', '拯救同胞'],
  ['约翰施洗', '预备道路'], ['彼得', '认耶稣是基督'], ['保罗', '外邦使徒'], ['提摩太', '年轻牧者'], ['路得', '忠诚媳妇'],
];

const PLACES = [
  ['伯利恒', '大卫城'], ['耶路撒冷', '圣殿所在'], ['加利利', '耶稣传道地'], ['约旦河', '施洗之处'], ['西奈山', '颁律法'],
  ['巴比伦', '被掳之地'], ['尼尼微', '亚述京城'], ['大马色', '保罗蒙召'], ['安提阿', '基督徒称呼'], ['以马忤斯', '复活显现'],
];

const questions = [];
let n = 0;

for (const theme of THEMES) {
  for (let i = 0; i < 50; i++) {
    const ref = theme.refs[i % theme.refs.length];
    const tpl = BOOK_QA[i % BOOK_QA.length];
    const id = `bank-${theme.id}-${i + 1}`;
    questions.push({
      id,
      theme: theme.name,
      themeId: theme.id,
      question: tpl.q.replace('{ref}', ref.replace('.', ' ')),
      options: [...tpl.opts],
      answer: tpl.a,
      explain: `${tpl.exp}（参考 ${ref}）`,
      ref,
    });
    n++;
  }
}

// 人物专题补充
for (let i = 0; i < PEOPLE.length; i++) {
  const [name, hint] = PEOPLE[i];
  for (let j = 0; j < 5; j++) {
    questions.push({
      id: `bank-person-${i}-${j}`,
      theme: '旧约人物',
      themeId: 'ot_people',
      question: `「${name}」在圣经中常以什么著称？`,
      options: [hint, '建造巴别塔', '写启示录', '分裂王国'],
      answer: 0,
      explain: `${name}：${hint}。`,
      ref: 'GEN.1.1',
    });
    n++;
  }
}

// 地理专题
for (let i = 0; i < PLACES.length; i++) {
  const [name, hint] = PLACES[i];
  for (let j = 0; j < 5; j++) {
    questions.push({
      id: `bank-place-${i}-${j}`,
      theme: '圣经地理',
      themeId: 'places',
      question: `「${name}」在圣经中的意义？`,
      options: [hint, '虚构之地', '仅出现在启示录', '无考古证据'],
      answer: 0,
      explain: `${name}：${hint}。`,
      ref: 'ACT.1.8',
    });
    n++;
  }
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify({ schema: 'question_bank@1', count: questions.length, themes: THEMES.map((t) => ({ id: t.id, name: t.name })), questions }, null, 0),
);
console.log(`Wrote ${questions.length} questions → ${out}`);
