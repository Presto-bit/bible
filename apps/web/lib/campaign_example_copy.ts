/** 读经三模板：示例文案（一键填入草稿，可改可清） */

import type { OpsCampaignLanding } from '@/lib/api';
import { ensureLandingBlocks, normalizeBlocks } from '@/lib/campaign_blocks';

export const READING_EXAMPLE_TEMPLATE_IDS = ['multi_day', 'verse_day', 'memory'] as const;

export type ReadingExampleTemplateId = (typeof READING_EXAMPLE_TEMPLATE_IDS)[number];

export function hasReadingExample(templateId: string): templateId is ReadingExampleTemplateId {
  return (READING_EXAMPLE_TEMPLATE_IDS as readonly string[]).includes(templateId);
}

type ExamplePack = {
  /** 按钮旁短说明 */
  blurb: string;
  /** 活动名称建议（仅填入 landing 时不改 name，由调用方决定） */
  suggestedName: string;
  introHeading: string;
  introBody: string;
  days: NonNullable<OpsCampaignLanding['days']>;
  /** 输入框 placeholder */
  placeholders: {
    introBody: string;
    dayTitle: string;
    dayBody: string;
    verseRef: string;
  };
};

const EXAMPLES: Record<ReadingExampleTemplateId, ExamplePack> = {
  multi_day: {
    blurb: '创世记开篇 3 日阅读示例',
    suggestedName: '创世记开篇 · 3 日共读',
    introHeading: '一起读创世记开篇',
    introBody:
      '用三天时间读完创造叙事的前半段。每天先读经文，再看短注，最后用讨论题在群里分享一句领受。',
    days: [
      {
        day: 1,
        title: '第 1 天 · 有光',
        verseRef: '创 1:1-5',
        body: '神说「要有光」，就把光暗分开。今天默想：神的话语如何带来秩序与盼望？试着把今天的一句话写下来。',
        discussionHint: '你最近在哪件事上需要「光」来照亮？',
      },
      {
        day: 2,
        title: '第 2 天 · 空气与陆地',
        verseRef: '创 1:6-13',
        body: '神分开上下的水，又使旱地露出、地长出青草。创造不是混乱，而是一步步安放。今天留意：神在「中间」做了什么？',
        discussionHint: '你生命里有没有需要重新「分界」的地方？',
      },
      {
        day: 3,
        title: '第 3 天 · 光体定节令',
        verseRef: '创 1:14-19',
        body: '日月星辰被摆上，为记号、定节令、日子、年岁。神不仅创造空间，也赐下时间的节奏。今天问自己：我的节奏是否与神同在？',
        discussionHint: '本周你打算怎样守住一段固定的亲近神时间？',
      },
    ],
    placeholders: {
      introBody: '写清活动目的与节奏，例如：一起按天读完这份材料。',
      dayTitle: '如：第 1 天 · 主题',
      dayBody: '今日阅读要点、默想短注…',
      verseRef: '如 创 1:1-5',
    },
  },
  verse_day: {
    blurb: '诗篇 23 单日经文示例',
    suggestedName: '今日经文 · 耶和华是我的牧者',
    introHeading: '今日经文',
    introBody: '今天一起默想诗篇二十三篇首句：耶和华是我的牧者，我必不致缺乏。读经 → 默想 → 回应。',
    days: [
      {
        day: 1,
        title: '今日经文',
        verseRef: '诗篇 23:1',
        body: '「耶和华是我的牧者，我必不致缺乏。」牧者认识羊、带领羊、供应羊。默想：神在哪些事上已经牧养你？你还在担忧什么「缺乏」？把担心交给牧者，用一句感谢回应祂。',
        discussionHint: '用一句话告诉群友：你今天因这段经文想到什么？',
      },
    ],
    placeholders: {
      introBody: '一句话说明今日主题，例如：一起默想一节经文。',
      dayTitle: '如：今日经文',
      dayBody: '经文默想短文、回应提示…',
      verseRef: '如 诗篇 23:1',
    },
  },
  memory: {
    blurb: '三节金句背诵示例',
    suggestedName: '金句背诵 · 三节起步',
    introHeading: '金句背诵挑战',
    introBody:
      '本周背三节根基经文。每天读出声、默写一次，记住后在清单勾选「已记住」。可与同伴互相抽查。',
    days: [
      {
        day: 1,
        title: '经文 1 · 神爱世人',
        verseRef: '约翰福音 3:16',
        body: '神爱世人，甚至将他的独生子赐给他们，叫一切信他的，不至灭亡，反得永生。',
        discussionHint: '试着不看经文背诵一遍，错了再读。',
      },
      {
        day: 2,
        title: '经文 2 · 我的牧者',
        verseRef: '诗篇 23:1',
        body: '耶和华是我的牧者，我必不致缺乏。',
        discussionHint: '把经文写成便签贴在常看见的地方。',
      },
      {
        day: 3,
        title: '经文 3 · 靠主刚强',
        verseRef: '腓立比书 4:13',
        body: '我靠着那加给我力量的，凡事都能做。',
        discussionHint: '回想一件你需要主加力的事，用这节经文祷告。',
      },
    ],
    placeholders: {
      introBody: '说明背诵规则，例如：逐节背诵，勾选已记住的经文。',
      dayTitle: '如：经文 1 · 主题',
      dayBody: '背诵经文全文（可含和合本原文）…',
      verseRef: '如 约 3:16',
    },
  },
};

export function getReadingExample(templateId: string): ExamplePack | null {
  if (!hasReadingExample(templateId)) return null;
  return EXAMPLES[templateId];
}

export function getReadingPlaceholders(templateId: string): ExamplePack['placeholders'] | null {
  return getReadingExample(templateId)?.placeholders || null;
}

/** 将示例写入 landing（覆盖 intro + days，并同步 intro 文本控件） */
export function applyReadingExample(
  landing: OpsCampaignLanding,
  templateId: string,
): OpsCampaignLanding | null {
  const pack = getReadingExample(templateId);
  if (!pack) return null;

  const base: OpsCampaignLanding = {
    ...landing,
    body: pack.introBody,
    days: pack.days.map((d) => ({ ...d })),
  };

  const ensured = ensureLandingBlocks(base, templateId);
  const blocks = normalizeBlocks(ensured.blocks).map((b) => {
    if (b.type === 'text' && (b.data?.role === 'intro' || b.data?.role === 'body')) {
      return {
        ...b,
        data: {
          ...(b.data || {}),
          heading: pack.introHeading,
          body: pack.introBody,
          role: 'intro',
        },
      };
    }
    return b;
  });

  return {
    ...ensured,
    body: pack.introBody,
    days: pack.days.map((d) => ({ ...d })),
    blocks,
  };
}

/** 当前落地页是否已有可读内容（填入前用于确认覆盖） */
export function landingHasReadableContent(landing: OpsCampaignLanding): boolean {
  if ((landing.body || '').trim()) return true;
  const days = landing.days || [];
  if (days.some((d) => (d.body || '').trim() || (d.verseRef || '').trim() || (d.title || '').trim())) {
    return true;
  }
  const intro = normalizeBlocks(landing.blocks).find(
    (b) => b.type === 'text' && (b.data?.role === 'intro' || b.data?.role === 'body'),
  );
  return Boolean(String(intro?.data?.body || '').trim());
}
