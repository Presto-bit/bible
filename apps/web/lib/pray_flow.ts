/** 沉浸祷告：对话式流程步骤（可左右滑 / 按时自动推进） */

export type PrayFlowStep = {
  id: string;
  /** 对话角色感：引导语像在对用户说话 */
  speaker: 'guide';
  text: string;
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
        speaker: 'guide',
        text: '你好。我们先把这一刻安静下来，好吗？',
        durationMs: 6000,
      },
      {
        id: 's2',
        speaker: 'guide',
        text: '你可以慢慢呼吸。不必急着说话，神已经在听。',
        durationMs: 8000,
      },
      {
        id: 's3',
        speaker: 'guide',
        text: '今天，有什么事想轻轻交托给他？在心里说一声就好。',
        durationMs: 10000,
      },
      {
        id: 's4',
        speaker: 'guide',
        text: '主啊，我们把这些放在你面前。求你赐平安，也赐智慧。',
        durationMs: 10000,
      },
      {
        id: 's5',
        speaker: 'guide',
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
        speaker: 'guide',
        text: '今天我们一起感恩。你准备好了吗？',
        durationMs: 5500,
      },
      {
        id: 's2',
        speaker: 'guide',
        text: '想一想：今天有哪一件小事，值得说「谢谢」？',
        durationMs: 9000,
      },
      {
        id: 's3',
        speaker: 'guide',
        text: '无论多小，都把它当作礼物接住。',
        durationMs: 8000,
      },
      {
        id: 's4',
        speaker: 'guide',
        text: '主啊，感谢你一切美善的赏赐。求你使我们常存感恩的心。',
        durationMs: 10000,
      },
      {
        id: 's5',
        speaker: 'guide',
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
        speaker: 'guide',
        text: '若心里有牵挂，我们可以一起交托。',
        durationMs: 6000,
      },
      {
        id: 's2',
        speaker: 'guide',
        text: '不必一次说完。先把最重的那一件，放在神面前。',
        durationMs: 9000,
      },
      {
        id: 's3',
        speaker: 'guide',
        text: '你不是独自面对。他顾念你。',
        durationMs: 8000,
      },
      {
        id: 's4',
        speaker: 'guide',
        text: '主啊，我们把忧虑卸给你。求你保守我们的心怀意念。',
        durationMs: 10000,
      },
      {
        id: 's5',
        speaker: 'guide',
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
        speaker: 'guide',
        text: '我们来到施恩座前。这里可以诚实，也可以柔软。',
        durationMs: 7000,
      },
      {
        id: 's2',
        speaker: 'guide',
        text: '若有亏欠，轻轻承认就好。他乐意赦免。',
        durationMs: 9000,
      },
      {
        id: 's3',
        speaker: 'guide',
        text: '也把别人的亏欠，交在他手里。',
        durationMs: 8000,
      },
      {
        id: 's4',
        speaker: 'guide',
        text: '主啊，求你照你的慈爱怜悯我们，洗净我们，更新我们。',
        durationMs: 10000,
      },
      {
        id: 's5',
        speaker: 'guide',
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
        speaker: 'guide',
        text: '新的一天，我们求他来引导脚步。',
        durationMs: 6000,
      },
      {
        id: 's2',
        speaker: 'guide',
        text: '你期待他在哪一件事上给你亮光？',
        durationMs: 9000,
      },
      {
        id: 's3',
        speaker: 'guide',
        text: '安静片刻。让他把方向放进你心里。',
        durationMs: 9000,
      },
      {
        id: 's4',
        speaker: 'guide',
        text: '主啊，求你指引我们今日的道路，叫我们专心仰赖你。',
        durationMs: 10000,
      },
      {
        id: 's5',
        speaker: 'guide',
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
