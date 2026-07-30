/** 解读/分析外部分享：洞见文案 + 追踪落地链 + 分享图 */

import { buildTrackedUrl } from './acquisition';
import { extractSummaryLead } from './assistant_markdown';
import { BRAND_NAME, BRAND_TAGLINE } from './brand';
import type { ShareCardInput } from './share_card';
import { isUserCode } from './user_code';

export type WeChatShareTarget = 'wechat_friend' | 'wechat_moments' | 'wechat_group';
export type AnalysisShareChannel = WeChatShareTarget | 'system_share';

export type AnalysisShareInput = {
  /** 经文引用，如「约翰福音 3:16」或 FREE */
  refLabel: string;
  /** 解读全文（可含 Markdown / 【摘要】） */
  answerText: string;
  /** 规范 ref，如 John.3.16；可选 */
  refParam?: string;
  /** 分享者 8 位 user_code，写入 ch3 */
  sharerUserCode?: string | null;
  /** 参考来源（写入服务端快照） */
  citations?: Array<{
    n: number;
    title: string;
    snippet?: string;
    document_id?: string | null;
    score?: number;
  }>;
};

export type AnalysisSharePack = {
  /** 系统分享 title：经文｜洞见 */
  title: string;
  /** 一句洞见（分享 text 主体） */
  insight: string;
  /** 落地主文案（可与 insight 相同或略长） */
  lead: string;
  /** 展开段（落地页「展开更多」） */
  more: string;
  /** 系统分享 text（洞见 + CTA，不含 URL） */
  shareText: string;
  card: ShareCardInput;
  urlFor: (target: AnalysisShareChannel) => string;
};

const INSIGHT_MAX = 80;
const LEAD_MAX = 120;
const MORE_MAX = 160;
const TITLE_MAX = 28;
const SITE = 'https://2sc.prestoai.cn';
const SHARE_CTA = '打开后保存到主屏幕，继续问小爱';

function stripMd(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, '')
    .replace(/[*_`>~]/g, '')
    .replace(/【[^】]+】/g, '')
    .replace(/［\d{1,2}］|\[\d{1,2}\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clip(text: string, max: number): string {
  const t = text.trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1))}…`;
}

function firstSentences(text: string, count: number): string[] {
  const cleaned = stripMd(text);
  if (!cleaned) return [];
  const parts: string[] = [];
  let buf = '';
  for (const ch of cleaned) {
    buf += ch;
    if ('。！？；!?'.includes(ch)) {
      const t = buf.trim();
      if (t) parts.push(t);
      buf = '';
      if (parts.length >= count) return parts.slice(0, count);
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts.length > 0 ? parts.slice(0, count) : [cleaned];
}

/** 洞见 / 主文 / 展开段 */
export function extractShareCopy(answerText: string, refLabel: string): {
  insight: string;
  lead: string;
  more: string;
} {
  const fallback = refLabel && refLabel !== 'FREE' && refLabel !== '小爱的解读'
    ? `一起读${refLabel}：打开看看小爱怎么说`
    : '打开彼爱，一起读这段经文。';
  const raw = (answerText || '').trim();
  if (!raw) {
    return { insight: fallback, lead: fallback, more: '' };
  }
  const { summary, body } = extractSummaryLead(raw);
  const summaryPlain = stripMd(summary);
  const bodyPlain = stripMd(body || raw);
  const source = summaryPlain || bodyPlain;
  const sentences = firstSentences(source, 4);
  const insight = clip(sentences[0] || fallback, INSIGHT_MAX) || fallback;
  const lead = clip(sentences.slice(0, 2).join('') || insight, LEAD_MAX) || insight;
  const moreSrc = sentences.slice(2, 4).join('') || firstSentences(bodyPlain, 2).join('');
  const more = moreSrc && moreSrc !== insight && moreSrc !== lead
    ? clip(moreSrc, MORE_MAX)
    : '';
  return { insight, lead, more };
}

function shareTitle(refLabel: string, insight: string): string {
  const ref =
    !refLabel || refLabel === 'FREE' || refLabel === '小爱的解读'
      ? BRAND_NAME
      : refLabel.trim();
  const sep = '｜';
  const budget = TITLE_MAX - [...ref].length - [...sep].length;
  if (budget < 4) return clip(ref, TITLE_MAX);
  return `${ref}${sep}${clip(insight, budget)}`;
}

function slugRef(refLabel: string, refParam?: string): string {
  const param = (refParam || '').trim().toLowerCase();
  if (param) {
    return param.replace(/\s+/g, '_').replace(/[^a-z0-9_.:-]+/g, '').slice(0, 48) || 'free';
  }
  const label = (refLabel || 'free').trim();
  let h = 0;
  for (let i = 0; i < label.length; i += 1) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return `r${h.toString(36)}`.slice(0, 16);
}

function sharerSuffix(code?: string | null): string {
  const c = (code || '').trim();
  return c && isUserCode(c) ? `.u:${c}` : '';
}

/** 解读分享落地路径（相对），含 ref + lead + more 供 OG / 页面展示 */
export function analysisSharePath(opts: {
  refLabel: string;
  lead: string;
  more?: string;
  refParam?: string;
  /** 服务端快照 id；有则优先短链 */
  snapshotId?: string;
}): string {
  if (opts.snapshotId?.trim()) {
    return `/share/analysis/${encodeURIComponent(opts.snapshotId.trim())}`;
  }
  const u = new URL('/share/analysis', SITE);
  u.searchParams.set('ref', opts.refLabel.slice(0, 64));
  u.searchParams.set('lead', opts.lead.slice(0, LEAD_MAX));
  if (opts.more?.trim()) u.searchParams.set('more', opts.more.trim().slice(0, MORE_MAX));
  if (opts.refParam?.trim()) u.searchParams.set('v', opts.refParam.trim().slice(0, 64));
  return `${u.pathname}${u.search}`;
}

export function analysisShareUrl(
  opts: {
    refLabel: string;
    lead: string;
    more?: string;
    refParam?: string;
    sharerUserCode?: string | null;
    snapshotId?: string;
  },
  target: AnalysisShareChannel,
): string {
  const path = analysisSharePath(opts);
  return buildTrackedUrl(path, {
    l1: 'share',
    l2: target,
    l3: `analysis:${opts.snapshotId?.trim() || slugRef(opts.refLabel, opts.refParam)}${sharerSuffix(opts.sharerUserCode)}`,
  });
}

export function buildAnalysisSharePack(
  input: AnalysisShareInput & { snapshotId?: string },
): AnalysisSharePack {
  const refLabel = (input.refLabel || '').trim() || '小爱的解读';
  const { insight, lead, more } = extractShareCopy(input.answerText, refLabel);
  const title = shareTitle(refLabel, insight);
  const shareText = `${insight}\n\n${SHARE_CTA}`;

  const card: ShareCardInput = {
    title: refLabel === 'FREE' || refLabel === '小爱的解读' ? '小爱的解读' : refLabel,
    subtitle: insight.slice(0, 36),
    body: lead,
    footer: `${BRAND_NAME} · ${BRAND_TAGLINE}`,
    badge: '小爱解读',
  };

  const base = {
    refLabel,
    lead,
    more,
    refParam: input.refParam,
    sharerUserCode: input.sharerUserCode,
    snapshotId: input.snapshotId,
  };

  return {
    title,
    insight,
    lead,
    more,
    shareText,
    card,
    urlFor: (target) => analysisShareUrl(base, target),
  };
}

/** 从 URL searchParams 解析落地展示（服务端 / 客户端共用） */
export function parseAnalysisShareParams(search: {
  get(name: string): string | null;
}): { refLabel: string; lead: string; more: string; refParam: string } {
  const refLabel = (search.get('ref') || '').trim().slice(0, 64) || '小爱的解读';
  const lead =
    (search.get('lead') || '').trim().slice(0, LEAD_MAX) ||
    '打开彼爱，一起读这段经文。';
  const more = (search.get('more') || '').trim().slice(0, MORE_MAX);
  const refParam = (search.get('v') || '').trim().slice(0, 64);
  return { refLabel, lead, more, refParam };
}

export function analysisShareSiteOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || SITE;
}

export { LEAD_MAX, MORE_MAX, INSIGHT_MAX };
