/** 沉浸祷告：主题流程库 + 时段 / 计划 / 阅读状态推荐 */

import { getActivePlan } from './plan_progress';
import { getLastRead, prayedToday } from './reading';

export type PrayFlowVerse = {
  ref: string;
  text: string;
};

export type PrayFlowStep = {
  id: string;
  text: string;
  verse?: PrayFlowVerse;
  durationMs: number;
};

/** 适配列：早 / 午 / 晚 */
export type PrayDaypart = 'morning' | 'day' | 'evening';

export type PrayFlowSession = {
  id: string;
  /** 主题短标签（chip） */
  label: string;
  /** 适合的时段 */
  dayparts: PrayDaypart[];
  /** 关联祷告计划 id 片段 */
  planHints?: string[];
  /** 关联最近阅读书卷 id（如 PSA、JHN） */
  bookHints?: string[];
  steps: PrayFlowStep[];
};

export const PRAY_FLOWS: readonly PrayFlowSession[] = [
  {
    id: 'quiet-heart',
    label: '安静',
    dayparts: ['morning', 'day', 'evening'],
    planHints: ['psalms', 'acts'],
    bookHints: ['PSA'],
    steps: [
      { id: 's1', text: '你好。我们先把这一刻安静下来，好吗？', durationMs: 6500 },
      {
        id: 's2',
        text: '你可以慢慢呼吸。不必急着说话，他已经在听。',
        verse: { ref: '诗篇 46:10', text: '你们要休息，要知道我是神。' },
        durationMs: 11000,
      },
      {
        id: 's3',
        text: '今天，有什么事想轻轻交托给他？在心里说一声就好。',
        durationMs: 10000,
      },
      {
        id: 's4',
        text: '主啊，我们把这些放在你面前。求你赐平安，也赐智慧。',
        verse: {
          ref: '腓立比书 4:6-7',
          text: '应当一无挂虑，只要凡事藉着祷告、祈求和感谢，将你们所要的告诉神。',
        },
        durationMs: 12000,
      },
      { id: 's5', text: '愿你的同在充满这一刻。阿们。', durationMs: 7000 },
    ],
  },
  {
    id: 'thanks',
    label: '感恩',
    dayparts: ['morning', 'day'],
    planHints: ['gratitude', 'morning'],
    bookHints: ['PSA'],
    steps: [
      { id: 's1', text: '今天我们一起感恩。你准备好了吗？', durationMs: 5500 },
      {
        id: 's2',
        text: '想一想：今天有哪一件小事，值得说「谢谢」？',
        verse: {
          ref: '诗篇 100:4',
          text: '当称谢进入他的门，当赞美进入他的院；当感谢他，称颂他的名。',
        },
        durationMs: 12000,
      },
      { id: 's3', text: '无论多小，都把它当作礼物接住。', durationMs: 8000 },
      {
        id: 's4',
        text: '主啊，感谢你一切美善的赏赐。求你使我们常存感恩的心。',
        verse: {
          ref: '雅各书 1:17',
          text: '各样美善的恩赐和各样全备的赏赐，都是从上头来的。',
        },
        durationMs: 11000,
      },
      { id: 's5', text: '阿们。愿感恩继续留在你心里。', durationMs: 7000 },
    ],
  },
  {
    id: 'trust',
    label: '交托',
    dayparts: ['day', 'evening'],
    planHints: ['peace', 'acts'],
    bookHints: ['PHP', 'ISA', 'MAT'],
    steps: [
      { id: 's1', text: '若心里有牵挂，我们可以一起交托。', durationMs: 6000 },
      {
        id: 's2',
        text: '不必一次说完。先把最重的那一件，放在他面前。',
        verse: {
          ref: '彼得前书 5:7',
          text: '你们要将一切的忧虑卸给神，因为他顾念你们。',
        },
        durationMs: 11000,
      },
      { id: 's3', text: '你不是独自面对。他顾念你。', durationMs: 8000 },
      {
        id: 's4',
        text: '主啊，我们把忧虑卸给你。求你保守我们的心怀意念。',
        verse: {
          ref: '以赛亚书 41:10',
          text: '你不要害怕，因为我与你同在；不要惊惶，因为我是你的神。',
        },
        durationMs: 12000,
      },
      { id: 's5', text: '愿出人意外的平安临到你。阿们。', durationMs: 7000 },
    ],
  },
  {
    id: 'mercy',
    label: '怜悯',
    dayparts: ['day', 'evening'],
    planHints: ['acts'],
    bookHints: ['ROM', '1JN', 'PSA'],
    steps: [
      {
        id: 's1',
        text: '我们来到施恩座前。这里可以诚实，也可以柔软。',
        durationMs: 7000,
      },
      {
        id: 's2',
        text: '若有亏欠，轻轻承认就好。他乐意赦免。',
        verse: {
          ref: '约翰一书 1:9',
          text: '我们若认自己的罪，神是信实的，是公义的，必要赦免我们的罪。',
        },
        durationMs: 12000,
      },
      { id: 's3', text: '也把别人的亏欠，交在他手里。', durationMs: 8000 },
      {
        id: 's4',
        text: '主啊，求你照你的慈爱怜悯我们，洗净我们，更新我们。',
        verse: {
          ref: '诗篇 51:10',
          text: '神啊，求你为我造清洁的心，使我里面重新有正直的灵。',
        },
        durationMs: 11000,
      },
      { id: 's5', text: '在他的怜悯里，你可以重新开始。阿们。', durationMs: 7000 },
    ],
  },
  {
    id: 'guide-day',
    label: '引导',
    dayparts: ['morning', 'day'],
    planHints: ['morning', 'acts'],
    bookHints: ['PRO', 'JOS', 'JHN'],
    steps: [
      { id: 's1', text: '新的一天，我们求他来引导脚步。', durationMs: 6000 },
      {
        id: 's2',
        text: '你期待他在哪一件事上给你亮光？',
        verse: {
          ref: '箴言 3:5-6',
          text: '你要专心仰赖耶和华，不可倚靠自己的聪明；在你一切所行的事上都要认定他，他必指引你的路。',
        },
        durationMs: 13000,
      },
      { id: 's3', text: '安静片刻。让他把方向放进你心里。', durationMs: 9000 },
      {
        id: 's4',
        text: '主啊，求你指引我们今日的道路，叫我们专心仰赖你。',
        verse: { ref: '诗篇 119:105', text: '你的话是我脚前的灯，是我路上的光。' },
        durationMs: 10000,
      },
      { id: 's5', text: '愿你所行的，都蒙他祝福。阿们。', durationMs: 7000 },
    ],
  },
  {
    id: 'anxiety',
    label: '平安',
    dayparts: ['day', 'evening'],
    planHints: ['peace'],
    bookHints: ['PHP', 'JHN', 'PSA'],
    steps: [
      { id: 's1', text: '若心里不安，我们可以一起停下来。', durationMs: 6000 },
      {
        id: 's2',
        text: '把那让你紧绷的事，轻轻放在他面前。',
        verse: {
          ref: '约翰福音 14:27',
          text: '我留下平安给你们，我将我的平安赐给你们。我所赐的，不像世人所赐的；你们心里不要忧愁，也不要胆怯。',
        },
        durationMs: 13000,
      },
      { id: 's3', text: '他的平安，不是催你更快，而是让你可以安息。', durationMs: 9000 },
      {
        id: 's4',
        text: '主啊，求你平静我们里面的风浪，赐下你的平安。',
        verse: {
          ref: '腓立比书 4:7',
          text: '神所赐出人意外的平安，必在基督耶稣里保守你们的心怀意念。',
        },
        durationMs: 11000,
      },
      { id: 's5', text: '愿平安守护你。阿们。', durationMs: 7000 },
    ],
  },
  {
    id: 'family',
    label: '家人',
    dayparts: ['day', 'evening'],
    planHints: [],
    bookHints: ['EPH', 'COL', 'RUT'],
    steps: [
      { id: 's1', text: '我们为家人安静片刻，好吗？', durationMs: 6000 },
      {
        id: 's2',
        text: '把你记挂的那一位，轻轻提到他面前。',
        verse: {
          ref: '约书亚记 24:15',
          text: '至于我和我家，我们必定事奉耶和华。',
        },
        durationMs: 11000,
      },
      { id: 's3', text: '求他赐爱、忍耐与彼此的理解。', durationMs: 8000 },
      {
        id: 's4',
        text: '主啊，求你看顾我们的家，使我们以爱相待。',
        verse: {
          ref: '歌罗西书 3:14',
          text: '在这一切之外，要存着爱心，爱心就是联络全德的。',
        },
        durationMs: 11000,
      },
      { id: 's5', text: '愿你家中有平安。阿们。', durationMs: 7000 },
    ],
  },
  {
    id: 'work',
    label: '工作',
    dayparts: ['morning', 'day'],
    planHints: ['morning'],
    bookHints: ['PRO', 'COL', 'ECC'],
    steps: [
      { id: 's1', text: '把今日的工作，先交在他手里。', durationMs: 6000 },
      {
        id: 's2',
        text: '你最担心的那一项任务，也可以说给他听。',
        verse: {
          ref: '歌罗西书 3:23',
          text: '无论做什么，都要从心里做，像是给主做的，不是给人做的。',
        },
        durationMs: 12000,
      },
      { id: 's3', text: '求智慧，也求忠心；结果交托给他。', durationMs: 8000 },
      {
        id: 's4',
        text: '主啊，求你赐下智慧与力量，叫我们所做的都荣耀你。',
        verse: {
          ref: '箴言 16:3',
          text: '你所做的，要交托耶和华，你所谋的，就必成立。',
        },
        durationMs: 11000,
      },
      { id: 's5', text: '愿他与你同行在今日的劳作中。阿们。', durationMs: 7000 },
    ],
  },
  {
    id: 'evening-rest',
    label: '晚间',
    dayparts: ['evening'],
    planHints: ['peace', 'psalms'],
    bookHints: ['PSA', 'MAT'],
    steps: [
      { id: 's1', text: '一天将尽，我们把身心交托给他。', durationMs: 6500 },
      {
        id: 's2',
        text: '回顾今日：有什么想感谢，有什么想放下？',
        verse: {
          ref: '诗篇 4:8',
          text: '我必安然躺下睡觉，因为独有你耶和华使我安然居住。',
        },
        durationMs: 12000,
      },
      { id: 's3', text: '未完成的，可以留到明天。他仍看顾。', durationMs: 9000 },
      {
        id: 's4',
        text: '主啊，求你赦免疏忽，赐我们安眠与更新。',
        verse: {
          ref: '马太福音 11:28',
          text: '凡劳苦担重担的人，可以到我这里来，我就使你们得安息。',
        },
        durationMs: 11000,
      },
      { id: 's5', text: '愿你安歇在他的看顾里。阿们。', durationMs: 7000 },
    ],
  },
];

export function listPrayFlows(): readonly PrayFlowSession[] {
  return PRAY_FLOWS;
}

export function prayFlowById(id: string): PrayFlowSession {
  return PRAY_FLOWS.find((f) => f.id === id) ?? PRAY_FLOWS[0]!;
}

export function prayDaypart(d = new Date()): PrayDaypart {
  const h = d.getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 18 || h < 5) return 'evening';
  return 'day';
}

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
}

function scoreFlow(
  flow: PrayFlowSession,
  opts: {
    part: PrayDaypart;
    planId: string | null;
    bookId: string | null;
    dayIdx: number;
    alreadyPrayed: boolean;
  },
): number {
  let score = 0;
  if (flow.dayparts.includes(opts.part)) score += 40;
  else score -= 20;

  if (opts.planId) {
    const pid = opts.planId.toLowerCase();
    if (flow.planHints?.some((h) => pid.includes(h))) score += 50;
  }

  if (opts.bookId && flow.bookHints?.includes(opts.bookId)) score += 35;

  // 轻微按日扰动，避免同分总出同一套
  score += (opts.dayIdx + flow.id.length * 3) % 7;

  // 今日已祷过：偏向安静 / 晚间，少推「引导」「工作」
  if (opts.alreadyPrayed) {
    if (flow.id === 'quiet-heart' || flow.id === 'evening-rest' || flow.id === 'thanks') {
      score += 12;
    }
    if (flow.id === 'work' || flow.id === 'guide-day') score -= 8;
  }

  // 晚间强推晚间主题
  if (opts.part === 'evening' && flow.id === 'evening-rest') score += 25;
  if (opts.part === 'morning' && (flow.id === 'guide-day' || flow.id === 'thanks')) score += 15;

  return score;
}

export type PrayPickResult = {
  recommended: PrayFlowSession;
  /** chip 顺序：推荐靠前，其余按标签稳定排序 */
  ordered: PrayFlowSession[];
  daypart: PrayDaypart;
  reason: string;
};

/** 综合时段、祷告计划、最近阅读，给出推荐主题 */
export function pickPrayFlow(d = new Date()): PrayPickResult {
  const part = prayDaypart(d);
  const active = getActivePlan();
  const planId =
    active?.kind === 'prayer' ? active.planId : null;
  const bookId = getLastRead()?.bookId ?? null;
  const alreadyPrayed = prayedToday();
  const dayIdx = dayOfYear(d);

  const ranked = [...PRAY_FLOWS]
    .map((flow) => ({
      flow,
      score: scoreFlow(flow, { part, planId, bookId, dayIdx, alreadyPrayed }),
    }))
    .sort((a, b) => b.score - a.score || a.flow.label.localeCompare(b.flow.label, 'zh'));

  const recommended = ranked[0]!.flow;
  const ordered = [
    recommended,
    ...ranked.slice(1).map((r) => r.flow),
  ];

  let reason = '今日推荐';
  if (planId && recommended.planHints?.some((h) => planId.toLowerCase().includes(h))) {
    reason = '配合你的祷告计划';
  } else if (bookId && recommended.bookHints?.includes(bookId)) {
    reason = '衔接你最近的阅读';
  } else if (part === 'morning') {
    reason = '清晨推荐';
  } else if (part === 'evening') {
    reason = '晚间推荐';
  }

  return { recommended, ordered, daypart: part, reason };
}

/** @deprecated 使用 pickPrayFlow；保留兼容 */
export function prayFlowForToday(d = new Date()): PrayFlowSession {
  return pickPrayFlow(d).recommended;
}
