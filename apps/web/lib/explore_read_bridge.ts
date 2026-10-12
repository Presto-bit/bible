/** 探索手稿合上后：静默「去读」桥（全屏内不做 CTA） */

import type { KnowledgeLayout, MapTour } from './api';
import { readerHrefFromRef } from './group_footprint';
import { normalizeInlineRef } from './inline_ref';
import { refToChineseLabel } from './ref_label';

export type ExploreReadBridge = {
  href: string;
  label: string;
};

export function firstManuscriptReadRef(
  bundle:
    | {
        layout?: KnowledgeLayout | null;
        tour?: MapTour | null;
      }
    | null
    | undefined,
): string | null {
  if (!bundle) return null;
  for (const beat of bundle.layout?.beats || []) {
    const ref = (beat.ref || '').trim();
    if (ref) return ref;
  }
  for (const stop of bundle.tour?.stops || []) {
    const ref = (stop.ref || '').trim();
    if (ref) return ref;
  }
  return null;
}

export function exploreReadBridge(
  rawRef: string | null | undefined,
): ExploreReadBridge | null {
  const raw = (rawRef || '').trim();
  if (!raw) return null;
  const osis = normalizeInlineRef(raw) || raw;
  const href = readerHrefFromRef(osis);
  const label = refToChineseLabel(raw) || refToChineseLabel(osis);
  if (!href || !label) return null;
  return { href, label };
}
