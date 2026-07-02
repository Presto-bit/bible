// 小爱定制化快捷提问（随用户读经特征变化）

import { getLastRead } from './reading';

export interface AssistantChip {
  label: string;
  mode: string;
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

  const chips: AssistantChip[] = [];

  if (anchor) {
    chips.push({
      label: '经文背景',
      mode: 'explain',
      q: `请结合历史与文化背景，介绍「${anchor}」这节经文在原文语境中的意思，并说明对今天的我有何提醒。`,
    });
    chips.push({
      label: '关键词释义',
      mode: 'explain',
      q: `请解释「${anchor}」中出现的关键神学术语（用简体中文），并举例说明如何应用在生活里。`,
    });
  } else if (last) {
    chips.push({
      label: '续读导读',
      mode: 'explain',
      q: `我上次读到 ${last.bookId} 第 ${last.chapter} 章，请帮我预习下一章的核心信息与默想问题。`,
    });
    chips.push({
      label: '关键词释义',
      mode: 'original',
      q: '请从原文角度解释我最近在读经卷中的一个核心词汇，并说明其神学意义。',
    });
  } else {
    chips.push({
      label: '今日默想',
      mode: 'apply',
      q: `根据今日经文${opts.dailyTheme ? `（主题：${opts.dailyTheme}）` : ''}，请给我 3 个适合个人的默想问题。`,
    });
    chips.push({
      label: '信仰问答',
      mode: 'understand',
      q: '作为读经初学者，请用浅显的中文解释「因信称义」是什么意思。',
    });
  }

  if ((opts.streak ?? 0) >= 7) {
    chips.push({
      label: '坚持鼓励',
      mode: 'apply',
      q: `我已连续读经 ${opts.streak} 天，请根据这段属灵旅程给我一段鼓励与下一步建议。`,
    });
  } else {
    chips.push({
      label: '生活应用',
      mode: 'apply',
      q: `请把${anchor ? `「${anchor}」` : '今日经文'}应用到职场与家庭中，给出具体可行的 3 条建议。`,
    });
  }

  return chips.slice(0, 4);
}
