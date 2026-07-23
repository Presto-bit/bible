/** 沉浸祷告：对话式流程（可左右滑 / 按时自动推进；含短经文） */

export type PrayFlowVerse = {
  ref: string;
  text: string;
};

export type PrayFlowStep = {
  id: string;
  /** 对话引导语 */
  text: string;
  /** 可选经文，与引导语同屏 */
  verse?: PrayFlowVerse;
  /** 本步停留毫秒（自动进入下一步） */
  durationMs: number;
};

export type PrayFlowSession = {
  id: string;
  steps: PrayFlowStep[];
};

const FLOWS: PrayFlowSession[] = [
  {
    id: 'quiet-heart',
    steps: [
      {
        id: 's1',
        text: '你好。我们先把这一刻安静下来，好吗？',
        durationMs: 6500,
      },
      {
        id: 's2',
        text: '你可以慢慢呼吸。不必急着说话，他已经在听。',
        verse: {
          ref: '诗篇 46:10',
          text: '你们要休息，要知道我是神。',
        },
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
      {
        id: 's5',
        text: '愿你的同在充满这一刻。阿们。',
        durationMs: 7000,
      },
    ],
  },
  {
    id: 'thanks',
    steps: [
      {
        id: 's1',
        text: '今天我们一起感恩。你准备好了吗？',
        durationMs: 5500,
      },
      {
        id: 's2',
        text: '想一想：今天有哪一件小事，值得说「谢谢」？',
        verse: {
          ref: '诗篇 100:4',
          text: '当称谢进入他的门，当赞美进入他的院；当感谢他，称颂他的名。',
        },
        durationMs: 12000,
      },
      {
        id: 's3',
        text: '无论多小，都把它当作礼物接住。',
        durationMs: 8000,
      },
      {
        id: 's4',
        text: '主啊，感谢你一切美善的赏赐。求你使我们常存感恩的心。',
        verse: {
          ref: '雅各书 1:17',
          text: '各样美善的恩赐和各样全备的赏赐，都是从上头来的。',
        },
        durationMs: 11000,
      },
      {
        id: 's5',
        text: '阿们。愿感恩继续留在你心里。',
        durationMs: 7000,
      },
    ],
  },
  {
    id: 'trust',
    steps: [
      {
        id: 's1',
        text: '若心里有牵挂，我们可以一起交托。',
        durationMs: 6000,
      },
      {
        id: 's2',
        text: '不必一次说完。先把最重的那一件，放在他面前。',
        verse: {
          ref: '彼得前书 5:7',
          text: '你们要将一切的忧虑卸给神，因为他顾念你们。',
        },
        durationMs: 11000,
      },
      {
        id: 's3',
        text: '你不是独自面对。他顾念你。',
        durationMs: 8000,
      },
      {
        id: 's4',
        text: '主啊，我们把忧虑卸给你。求你保守我们的心怀意念。',
        verse: {
          ref: '以赛亚书 41:10',
          text: '你不要害怕，因为我与你同在；不要惊惶，因为我是你的神。',
        },
        durationMs: 12000,
      },
      {
        id: 's5',
        text: '愿出人意外的平安临到你。阿们。',
        durationMs: 7000,
      },
    ],
  },
  {
    id: 'mercy',
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
      {
        id: 's3',
        text: '也把别人的亏欠，交在他手里。',
        durationMs: 8000,
      },
      {
        id: 's4',
        text: '主啊，求你照你的慈爱怜悯我们，洗净我们，更新我们。',
        verse: {
          ref: '诗篇 51:10',
          text: '神啊，求你为我造清洁的心，使我里面重新有正直的灵。',
        },
        durationMs: 11000,
      },
      {
        id: 's5',
        text: '在他的怜悯里，你可以重新开始。阿们。',
        durationMs: 7000,
      },
    ],
  },
  {
    id: 'guide-day',
    steps: [
      {
        id: 's1',
        text: '新的一天，我们求他来引导脚步。',
        durationMs: 6000,
      },
      {
        id: 's2',
        text: '你期待他在哪一件事上给你亮光？',
        verse: {
          ref: '箴言 3:5-6',
          text: '你要专心仰赖耶和华，不可倚靠自己的聪明；在你一切所行的事上都要认定他，他必指引你的路。',
        },
        durationMs: 13000,
      },
      {
        id: 's3',
        text: '安静片刻。让他把方向放进你心里。',
        durationMs: 9000,
      },
      {
        id: 's4',
        text: '主啊，求你指引我们今日的道路，叫我们专心仰赖你。',
        verse: {
          ref: '诗篇 119:105',
          text: '你的话是我脚前的灯，是我路上的光。',
        },
        durationMs: 10000,
      },
      {
        id: 's5',
        text: '愿你所行的，都蒙他祝福。阿们。',
        durationMs: 7000,
      },
    ],
  },
];

/** 按日轮换一套对话流程 */
export function prayFlowForToday(d = new Date()): PrayFlowSession {
  const start = new Date(d.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((d.getTime() - start.getTime()) / 86_400_000);
  const idx = ((dayOfYear % FLOWS.length) + FLOWS.length) % FLOWS.length;
  return FLOWS[idx]!;
}
