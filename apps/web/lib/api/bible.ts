/** 圣经域 API：目录 / 章节 / 搜索 / 译本（窄依赖 api_core）。 */

import { getJson } from '../api_core';
import type { BibleBook, Verse } from '../api_core';

export type { BibleBook, Verse };

export interface BibleSearchHit {
  book: string;
  name: string;
  chapter: number;
  verse: number;
  text: string;
  ref: string;
  osis: string;
  version: string;
}

export interface BibleVersion {
  id: string;
  label: string;
  available: boolean;
  primary: boolean;
}

export interface VerseRendition {
  version: string;
  label: string;
  text: string;
}

export interface CompareResult {
  ref: string;
  osis: string;
  book: string;
  chapter: number;
  verse: number;
  versions: VerseRendition[];
}

export interface GuideCard {
  title: string;
  snippet: string;
  score: number;
}

export interface GuideResult {
  ok: boolean;
  ref: string;
  display: string;
  passage: string;
  cards: GuideCard[];
  knowledge_base_id?: string;
  knowledge_base_name?: string;
}

export const bibleApi = {
  books: () => getJson<{ books: BibleBook[] }>('/bible/books'),
  chapter: (book: string, chapter: number, version?: string) =>
    getJson<{ verses: Verse[] }>(
      `/bible/chapter?book=${encodeURIComponent(book)}&chapter=${chapter}${version ? `&version=${encodeURIComponent(version)}` : ''}`,
    ),
  search: (
    q: string,
    opts?: {
      version?: string;
      testament?: 'OT' | 'NT';
      limit?: number;
      offset?: number;
    },
  ) => {
    const params = new URLSearchParams({ q });
    if (opts?.version) params.set('version', opts.version);
    if (opts?.testament) params.set('testament', opts.testament);
    if (opts?.limit != null) params.set('limit', String(opts.limit));
    if (opts?.offset != null) params.set('offset', String(opts.offset));
    return getJson<{
      hits: BibleSearchHit[];
      total?: number;
      total_ot?: number;
      total_nt?: number;
      has_more?: boolean;
      limit?: number;
      offset?: number;
      version?: string;
      testament?: string;
    }>(`/bible/search?${params.toString()}`);
  },
  versions: () => getJson<{ versions: BibleVersion[] }>('/bible/versions'),
  compare: (ref: string) =>
    getJson<CompareResult>(`/bible/compare?ref=${encodeURIComponent(ref)}`),
  scriptureRef: (ref: string) =>
    getJson<{ ref: string; display: string; verses: Verse[] }>(
      `/bible/ref?ref=${encodeURIComponent(ref)}`,
    ),
  guide: (ref: string, knowledgeBaseId?: string | null) => {
    const q = new URLSearchParams({ ref });
    if (knowledgeBaseId) q.set('knowledge_base_id', knowledgeBaseId);
    return getJson<GuideResult>(`/guide/passage?${q}`);
  },
};
