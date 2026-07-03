import type { TopicEntry } from './api';
import { LIFE_TOPICS, type LifeTopic } from './discover_topics';

const PALETTE = [
  '#6b8f71', '#7a8fa8', '#8b7355', '#9a7b6e', '#6e8b8b',
  '#8b6e7a', '#7a6e8b', '#6e7a8b', '#8b8b6e', '#6e8b6e',
];

export function topicColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}

export function mergeDiscoverTopics(apiTopics: TopicEntry[]): Array<LifeTopic | (TopicEntry & { color: string })> {
  const staticIds = new Set(LIFE_TOPICS.map((t) => t.id));
  const merged: Array<LifeTopic | (TopicEntry & { color: string })> = [...LIFE_TOPICS];
  apiTopics.forEach((t, i) => {
    if (staticIds.has(t.id) || staticIds.has(t.name)) return;
    merged.push({ ...t, color: topicColor(LIFE_TOPICS.length + i) });
  });
  return merged;
}

export function isLifeTopic(t: LifeTopic | (TopicEntry & { color: string })): t is LifeTopic {
  return 'subtitle' in t && typeof (t as LifeTopic).subtitle === 'string';
}
