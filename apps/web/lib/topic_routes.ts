/** 知识专题深链与精选 id（MVD 对外展示子集） */

export const FEATURED_MAP_TOUR = 'exodus-wilderness';
export const FEATURED_TIMELINE_TOUR = 'life-of-jesus';
export const FEATURED_GRAPH_TOPIC = 'exodus-core';
export const FEATURED_DIAGRAM = 'tabernacle-layout';

export const FEATURED_GRAPH_TOPICS = ['exodus-core', 'patriarchs', 'paul-companions'] as const;
export const FEATURED_DIAGRAM_IDS = [
  'tabernacle-layout',
  'ark-of-covenant',
  'temple-layout',
  'passover-door',
] as const;

export function mapStoryHref(tourId?: string) {
  return `/search/map/${encodeURIComponent(tourId || FEATURED_MAP_TOUR)}`;
}

export function timelineStoryHref(tourId?: string) {
  return `/search/timeline/${encodeURIComponent(tourId || FEATURED_TIMELINE_TOUR)}`;
}

export function graphTopicHref(topicId?: string) {
  return `/search/graph/${encodeURIComponent(topicId || FEATURED_GRAPH_TOPIC)}`;
}

export function diagramTourHref(diagramId?: string) {
  return `/search/diagrams/${encodeURIComponent(diagramId || FEATURED_DIAGRAM)}`;
}

export const SEARCH_HOT_KEYWORDS = [
  '约翰福音',
  '诗篇 23',
  '罗马书 8',
  '恩典',
  '祷告',
  '信心',
  '平安',
  '摩西',
] as const;
