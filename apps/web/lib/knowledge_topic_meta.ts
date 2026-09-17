/** 探索列表弱标签：行程密图 / 运营笔记；音视频角标预留 */

import type { KnowledgeLayoutSummary } from './api';

export type KnowledgeTopicKind = 'journey' | 'note';

export type KnowledgeMediaKind = 'image' | 'audio' | 'video';

/** 列表摘要可选扩展（API 未返回时客户端推断） */
export type KnowledgeTopicMeta = {
  kind: KnowledgeTopicKind;
  media: KnowledgeMediaKind[];
};

const JOURNEY_IDS = new Set(['paul-first-journey', 'exodus-wilderness']);

export function resolveKnowledgeTopicMeta(
  row: KnowledgeLayoutSummary & {
    kind?: string;
    media_kinds?: string[];
    media?: { type?: string }[];
  },
): KnowledgeTopicMeta {
  const rawKind = (row.kind || '').trim().toLowerCase();
  let kind: KnowledgeTopicKind =
    rawKind === 'note' || rawKind === 'post' ? 'note' : 'journey';
  if (!rawKind) {
    const id = row.id || '';
    const tpl = (row.template || '').toLowerCase();
    if (JOURNEY_IDS.has(id) || tpl.includes('journey') || tpl.includes('path') || tpl.includes('map')) {
      kind = 'journey';
    } else if (tpl.includes('note') || tpl.includes('post')) {
      kind = 'note';
    } else {
      kind = 'journey';
    }
  }

  const media = new Set<KnowledgeMediaKind>(['image']);
  const fromKinds = row.media_kinds;
  if (Array.isArray(fromKinds)) {
    for (const k of fromKinds) {
      if (k === 'audio' || k === 'video' || k === 'image') media.add(k);
    }
  }
  const fromMedia = row.media;
  if (Array.isArray(fromMedia)) {
    for (const m of fromMedia) {
      const t = (m?.type || '').toLowerCase();
      if (t === 'audio' || t === 'video' || t === 'image') media.add(t);
    }
  }

  return { kind, media: [...media] };
}

export function knowledgeKindLabel(kind: KnowledgeTopicKind): string {
  return kind === 'note' ? '笔记' : '行程';
}

/** 有音/视频时列表角标文案（图文默认不叠「看」） */
export function knowledgeMediaBadge(media: KnowledgeMediaKind[]): string | null {
  if (media.includes('video')) return '看';
  if (media.includes('audio')) return '听';
  return null;
}
