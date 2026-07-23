/** 沉浸祷告：短默祷文案池（按北京日序轮换，不接 prayer-today） */

export type PrayMoment = {
  id: string;
  kicker: string;
  body: string;
  amen?: string;
};

const MOMENTS: PrayMoment[] = [
  {
    id: 'still-1',
    kicker: '安静片刻',
    body: '主啊，我把这一刻交给你。求你使我的心安静，听见你的声音。',
  },
  {
    id: 'thanks-1',
    kicker: '感恩',
    body: '感谢你今日的供应与同在。凡是美善的礼物，都从你而来。',
  },
  {
    id: 'trust-1',
    kicker: '交托',
    body: '我把牵挂的事放在你面前。求你赐下出人意外的平安，保守我的心怀意念。',
  },
  {
    id: 'mercy-1',
    kicker: '求怜悯',
    body: '主啊，求你照你的慈爱怜悯我。洗净我，使我重新有正直的灵。',
  },
  {
    id: 'guide-1',
    kicker: '求引导',
    body: '求你指引我今日的脚步。愿我不靠自己的聪明，只专心仰赖你。',
  },
  {
    id: 'love-1',
    kicker: '爱',
    body: '求你使我更深认识你的爱，也学习用温柔与诚实对待身边的人。',
  },
  {
    id: 'strength-1',
    kicker: '得力',
    body: '我的力量软弱时，求你作我的力量。靠着那加给我力量的，凡事都能。',
  },
  {
    id: 'peace-1',
    kicker: '平安',
    body: '愿你的平安临到我心里。风浪中，你仍是我的避难所。',
  },
  {
    id: 'hope-1',
    kicker: '盼望',
    body: '求你使我不失去盼望。你的信实广大，你的话语安定在天。',
  },
  {
    id: 'humble-1',
    kicker: '谦卑',
    body: '求你除去我心里的骄傲与急躁，赐我温柔谦卑的心，效法基督。',
  },
  {
    id: 'forgive-1',
    kicker: '饶恕',
    body: '求你赦免我所犯的过错，也帮助我饶恕得罪我的人，如同你饶恕了我。',
  },
  {
    id: 'word-1',
    kicker: '话语',
    body: '求你打开我的心，使我今日所读、所听的话语，不只停留在耳中，更能行出来。',
  },
  {
    id: 'family-1',
    kicker: '家人',
    body: '求你看顾我的家人。愿你家中有平安，有爱，有彼此的忍耐与祝福。',
  },
  {
    id: 'work-1',
    kicker: '今日劳作',
    body: '我将今日的工作交托给你。求你赐智慧与忠心，叫我所做的都荣耀你。',
  },
  {
    id: 'church-1',
    kicker: '肢体',
    body: '求你祝福教会与身边的弟兄姊妹。使我们彼此建立，同心合意。',
  },
  {
    id: 'sorrow-1',
    kicker: '忧伤中',
    body: '主啊，你靠近伤心的人。求你擦去眼泪，用安慰环绕我。',
  },
  {
    id: 'joy-1',
    kicker: '喜乐',
    body: '求你使我靠你喜乐。不是环境常顺，而是因你同在就有满足。',
  },
  {
    id: 'presence-1',
    kicker: '同在',
    body: '你与我同在。无论往哪里去，你的恩典够我用。',
  },
  {
    id: 'listen-1',
    kicker: '聆听',
    body: '求你开通我的耳朵。在安静里，教我说：「请说，仆人敬听。」',
  },
  {
    id: 'daily-1',
    kicker: '日用饮食',
    body: '求你赐我今日所需。使我知足，也使我愿意与人分享。',
  },
  {
    id: 'protect-1',
    kicker: '保守',
    body: '求你保守我远离试探，救我脱离凶恶。愿你的名得着荣耀。',
  },
  {
    id: 'light-1',
    kicker: '光照',
    body: '你是世界的光。求你照亮我心里的黑暗，引导我走光明的路。',
  },
  {
    id: 'rest-1',
    kicker: '安息',
    body: '劳苦担重担的，可以到你这里来。求你使我的魂得安息。',
  },
  {
    id: 'mission-1',
    kicker: '见证',
    body: '求你给我勇气，用温柔的心见证你的恩典，成为别人的祝福。',
  },
  {
    id: 'silence-1',
    kicker: '静默',
    body: '不必多言。我在你面前静默。你知道我的心思意念。',
    amen: '阿们',
  },
  {
    id: 'morning-1',
    kicker: '清晨',
    body: '新的一天，求你更新我的灵。愿我的口所出、心所想，都蒙你悦纳。',
  },
  {
    id: 'evening-1',
    kicker: '夜间',
    body: '一天将尽，我将所行的交托给你。求你赦免疏忽，赐我安眠。',
  },
  {
    id: 'cross-1',
    kicker: '十架',
    body: '因着十字架的爱，我得以亲近你。求你使我不忘代价，常存感恩。',
  },
  {
    id: 'spirit-1',
    kicker: '圣灵',
    body: '求圣灵充满我，指教我祷告，也结出仁爱、喜乐、和平的果子。',
  },
  {
    id: 'kingdom-1',
    kicker: '国度',
    body: '愿你的国降临，愿你的旨意行在地上，如同行在天上。',
  },
];

/** 按本地日序取今日默祷（与每日经文同一天感，但不共用内容源） */
export function prayMomentForToday(d = new Date()): PrayMoment {
  const start = new Date(d.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((d.getTime() - start.getTime()) / 86_400_000);
  const idx = ((dayOfYear % MOMENTS.length) + MOMENTS.length) % MOMENTS.length;
  return MOMENTS[idx]!;
}

export function allPrayMoments(): readonly PrayMoment[] {
  return MOMENTS;
}
