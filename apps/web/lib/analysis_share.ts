/** 解读/分析外部分享：摘要图 + 追踪落地链 + 文案 */

import { buildTrackedUrl } from './acquisition';
import { extractSummaryLead } from './assistant_markdown';
import { BRAND_NAME, BRAND_TAGLINE } from './brand';
import type { ShareCardInput } from './share_card';
import { isUserCode } from './user_code';

export type WeChatShareTarget = 'wechat_friend' | 'wechat_moments' | 'wechat_group';

export type AnalysisShareInput = {
  /** 经文引用，如「约翰福音 3:16」或 FREE */
  refLabel: string;
  /** 解读全文（可含 Markdown / 【摘要】） */
  answerText: string;
  /** 规范 ref，如 John.3.16；可选 */
  refParam?: string;
  /** 分享者 8 位 user_code，写入 ch3 */
  sharerUserCode?: string | null;
};

export type AnalysisSharePack = {
  title: string;
  lead: string;
  card: ShareCardInput;
  /** 按目标渠道生成的落地 URL */
  urlFor: (target: WeChatShareTarget) => string;
  /** 发给好友/群的粘贴文案 */
  copyText: (target: WeChatShareTarget) => string;
  momentsHint: string;
  friendHint: string;
};

const LEAD_MAX = 120;
const SITE = 'https://2sc.prestoai.cn';

function plainLead(answerText: string): string {
  const raw = (answerText || '').trim();
  if (!raw) return '打开彼爱，一起读这段经文。';
  const { summary } = extractSummaryLead(raw);
  const base = (summary || raw)
    .replace(/#{1,6}\s*/g, '')
    .replace(/[*_`>~]/g, '')
    .replace(/【[^】]+】/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (base.length <= LEAD_MAX) return base;
  return `${base.slice(0, LEAD_MAX - 1)}…`;
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

/** 解读分享落地路径（相对），含 ref + lead 供 OG / 页面展示 */
export function analysisSharePath(opts: {
  refLabel: string;
  lead: string;
  refParam?: string;
}): string {
  const u = new URL('/share/analysis', SITE);
  u.searchParams.set('ref', opts.refLabel.slice(0, 64));
  u.searchParams.set('lead', opts.lead.slice(0, LEAD_MAX));
  if (opts.refParam?.trim()) u.searchParams.set('v', opts.refParam.trim().slice(0, 64));
  return `${u.pathname}${u.search}`;
}

export function analysisShareUrl(
  opts: { refLabel: string; lead: string; refParam?: string; sharerUserCode?: string | null },
  target: WeChatShareTarget,
): string {
  const path = analysisSharePath(opts);
  return buildTrackedUrl(path, {
    l1: 'share',
    l2: target,
    l3: `analysis:${slugRef(opts.refLabel, opts.refParam)}${sharerSuffix(opts.sharerUserCode)}`,
  });
}

export function buildAnalysisSharePack(input: AnalysisShareInput): AnalysisSharePack {
  const refLabel = (input.refLabel || '').trim() || '小爱的解读';
  const lead = plainLead(input.answerText);
  const title = refLabel === 'FREE' || refLabel === '小爱的解读'
    ? `${BRAND_NAME} · 一分钟解读`
    : `${refLabel} · 一分钟解读`;

  const card: ShareCardInput = {
    title: refLabel === 'FREE' ? '小爱的解读' : refLabel,
    subtitle: '一分钟解读',
    body: lead,
    footer: `${BRAND_NAME} · ${BRAND_TAGLINE}`,
  };

  const base = {
    refLabel,
    lead,
    refParam: input.refParam,
    sharerUserCode: input.sharerUserCode,
  };

  return {
    title,
    lead,
    card,
    urlFor: (target) => analysisShareUrl(base, target),
    copyText: (target) => {
      const url = analysisShareUrl(base, target);
      const guide =
        target === 'wechat_moments'
          ? '（完整解读见链接；也可保存分享图发朋友圈）'
          : '打开链接可阅读摘要，并继续问小爱';
      return [`【${title}】`, lead, '', guide, url].join('\n');
    },
    momentsHint: '保存图片 → 打开微信朋友圈 → 从相册选择该图发布',
    friendHint: '复制链接或文案 → 打开微信 → 粘贴发给好友或群',
  };
}

/** 从 URL searchParams 解析落地展示（服务端 / 客户端共用） */
export function parseAnalysisShareParams(search: {
  get(name: string): string | null;
}): { refLabel: string; lead: string; refParam: string } {
  const refLabel = (search.get('ref') || '').trim().slice(0, 64) || '小爱的解读';
  const lead = (search.get('lead') || '').trim().slice(0, LEAD_MAX) || '打开彼爱，一起读这段经文。';
  const refParam = (search.get('v') || '').trim().slice(0, 64);
  return { refLabel, lead, refParam };
}

export function analysisShareSiteOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || SITE;
}
