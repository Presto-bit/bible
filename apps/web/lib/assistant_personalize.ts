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

function chip(
  label: string,
  scene: AssistantScene,
  q: string,
): AssistantChip {
  return { label, scene, mode: SCENES[scene].mode, q };
}

export function personalizedAssistantChips(opts: {
  ref?: string;
  dailyVerseRef?: string;
  dailyTheme?: string;
  streak?: number;
}): AssistantChip[] {
  const anchor = opts.ref || opts.dailyVerseRef || '';
  const refLabel = anchor || undefined;
  const chips: AssistantChip[] = [];

  if (anchor) {
    chips.push(
      chip('经文背景', 'chat_explain', chipUserQuestion('解释经文', refLabel)),
      chip('生活应用', 'chat_apply', chipUserQuestion('生活应用', refLabel)),
      chip('预备查经', 'chat_study', chipUserQuestion('预备查经', refLabel)),
      chip('译本对照', 'chat_compare', chipUserQuestion('译本对照', refLabel)),
    );
  } else {
    chips.push(
      chip(
        '今日默想',
        'chat_apply',
        `根据今日经文${opts.dailyTheme ? `（主题：${opts.dailyTheme}）` : ''}，请给我 3 个适合个人的默想问题。`,
      ),
      chip('生活应用', 'chat_apply', chipUserQuestion('生活应用', refLabel)),
      chip('信仰问答', 'chat_understand', '作为读经初学者，请用浅显的中文解释「因信称义」是什么意思。'),
      chip('预备查经', 'chat_study', chipUserQuestion('预备查经', refLabel)),
    );
    // 有续读位置时仍给平行 pill，但不使用「续读导读」
    if (getLastRead()) {
      chips.push(chip('解释经文', 'chat_explain', chipUserQuestion('解释经文', refLabel)));
    }
  }

  if ((opts.streak ?? 0) >= 7) {
    chips.push(
      chip(
        '坚持鼓励',
        'chat_apply',
        `我已连续读经 ${opts.streak} 天，请根据这段属灵旅程给我一段鼓励与下一步建议。`,
      ),
    );
  }

  const seen = new Set<string>();
  return chips.filter((c) => {
    if (seen.has(c.label)) return false;
    seen.add(c.label);
    return true;
  }).slice(0, 6);
}
