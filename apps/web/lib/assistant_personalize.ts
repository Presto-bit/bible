// 小爱定制化快捷提问（随用户读经特征变化）

import { getLastRead } from './reading';
import {
  chipUserQuestion,
  SCENES,
  type AssistantScene,
} from './assistant_scenes';

export interface AssistantChip {
  label: string;
  mode: string;
  scene: AssistantScene;
  q: string;
}

export function personalizedAssistantChips(opts: {
  ref?: string;
  dailyVerseRef?: string;
  dailyTheme?: string;
  streak?: number;
}): AssistantChip[] {
  const anchor = opts.ref || opts.dailyVerseRef || '';
  const last = getLastRead();
  const refLabel = anchor || undefined;

  const chips: AssistantChip[] = [];

  if (anchor) {
    chips.push({
      label: '经文背景',
      scene: 'chat_explain',
      mode: SCENES.chat_explain.mode,
      q: chipUserQuestion('解释经文', refLabel),
    });
    chips.push({
      label: '关键词释义',
      scene: 'chat_original',
      mode: SCENES.chat_original.mode,
      q: chipUserQuestion('原文释义', refLabel),
    });
  } else if (last) {
    chips.push({
      label: '续读导读',
      scene: 'chat_explain',
      mode: SCENES.chat_explain.mode,
      q: `我上次读到 ${last.bookId} 第 ${last.chapter} 章，请帮我预习下一章的核心信息与默想问题。`,
    });
    chips.push({
      label: '关键词释义',
      scene: 'chat_original',
      mode: SCENES.chat_original.mode,
      q: chipUserQuestion('原文释义'),
    });
  } else {
    chips.push({
      label: '今日默想',
      scene: 'chat_apply',
      mode: SCENES.chat_apply.mode,
      q: `根据今日经文${opts.dailyTheme ? `（主题：${opts.dailyTheme}）` : ''}，请给我 3 个适合个人的默想问题。`,
    });
    chips.push({
      label: '信仰问答',
      scene: 'chat_understand',
      mode: SCENES.chat_understand.mode,
      q: '作为读经初学者，请用浅显的中文解释「因信称义」是什么意思。',
    });
  }

  if ((opts.streak ?? 0) >= 7) {
    chips.push({
      label: '坚持鼓励',
      scene: 'chat_apply',
      mode: SCENES.chat_apply.mode,
      q: `我已连续读经 ${opts.streak} 天，请根据这段属灵旅程给我一段鼓励与下一步建议。`,
    });
  } else {
    chips.push({
      label: '生活应用',
      scene: 'chat_apply',
      mode: SCENES.chat_apply.mode,
      q: chipUserQuestion('生活应用', refLabel),
    });
  }

  return chips.slice(0, 4);
}
