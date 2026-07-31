/** 知识导览出站分享：氛围卡 + 深链回专题 */

import { BRAND_NAME } from './brand';
import {
  knowledgeKindLabel,
  knowledgeRelatedHref,
  tourHook,
  type KnowledgeRelatedKind,
} from './knowledge_story';
import { shareCardOutbound, type ShareCardOutboundInput } from './share_card';
import type { ShareOutboundResult } from './share_outbound';
import { toCanonicalShareUrl } from './share_site';

export type KnowledgeShareInput = {
  kind: KnowledgeRelatedKind;
  id: string;
  title: string;
  /** 卡正文：优先最后一站 note / hook */
  body: string;
  /** 如「8 站 · 彼爱」 */
  footer?: string;
  /** 系列走完时的角标文案 */
  badge?: string;
};

const WALLPAPER_DAY: Record<KnowledgeRelatedKind, number> = {
  map: 1,
  timeline: 2,
  diagram: 4,
  graph: 5,
};

export function knowledgeSharePath(kind: KnowledgeRelatedKind, id: string): string {
  return knowledgeRelatedHref({ kind, id, label: '' });
}

export async function shareKnowledgeTour(
  input: KnowledgeShareInput,
): Promise<ShareOutboundResult> {
  const path = knowledgeSharePath(input.kind, input.id);
  const shareUrl = toCanonicalShareUrl(path);
  const hook = tourHook(input.id);
  const kindLabel = knowledgeKindLabel(input.kind);
  const body = (input.body || hook || input.title).trim();
  const card: ShareCardOutboundInput = {
    title: input.title,
    subtitle: kindLabel,
    body,
    footer: input.footer || `${kindLabel} · ${BRAND_NAME}`,
    badge: input.badge || '圣经知识',
    day: WALLPAPER_DAY[input.kind] ?? 1,
    shareTitle: `${input.title}｜${BRAND_NAME}`,
    shareText: [body, `在${BRAND_NAME}继续走这一程`].filter(Boolean).join('\n'),
    shareUrl,
    allowDownload: false,
  };
  return shareCardOutbound(card);
}
