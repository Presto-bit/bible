import type { DailyVerseReactPreset } from './api';

/** 与后端 `daily_verse_react.DAILY_VERSE_REACT_PRESETS` 对齐（离线兜底）。 */
export const DAILY_VERSE_REACT_EMOJIS: DailyVerseReactPreset[] = [
  { id: 'emoji:pray', kind: 'emoji', emoji: '🙏', label: '祷告' },
  { id: 'emoji:heart', kind: 'emoji', emoji: '❤️', label: '喜爱' },
  { id: 'emoji:dove', kind: 'emoji', emoji: '🕊️', label: '平安' },
  { id: 'emoji:sparkle', kind: 'emoji', emoji: '✨', label: '光照' },
  { id: 'emoji:sunrise', kind: 'emoji', emoji: '🌅', label: '盼望' },
  { id: 'emoji:strong', kind: 'emoji', emoji: '💪', label: '力量' },
  { id: 'emoji:hands', kind: 'emoji', emoji: '🤲', label: '仰望' },
  { id: 'emoji:smile', kind: 'emoji', emoji: '😊', label: '喜乐' },
  { id: 'emoji:tear', kind: 'emoji', emoji: '😢', label: '被触动' },
  { id: 'emoji:fire', kind: 'emoji', emoji: '🔥', label: '火热' },
];

export const DAILY_VERSE_REACT_PHRASES: DailyVerseReactPreset[] = [
  { id: 'phrase:amen', kind: 'phrase', emoji: '🙏', label: '阿们' },
  { id: 'phrase:comfort', kind: 'phrase', emoji: '🕊️', label: '今日得安慰' },
  { id: 'phrase:about_me', kind: 'phrase', emoji: '✨', label: '与我有关' },
  { id: 'phrase:rely', kind: 'phrase', emoji: '🤲', label: '提醒我倚靠神' },
  { id: 'phrase:strength', kind: 'phrase', emoji: '💪', label: '加添力量' },
  { id: 'phrase:peace', kind: 'phrase', emoji: '🌅', label: '心里平安' },
  { id: 'phrase:thanks', kind: 'phrase', emoji: '❤️', label: '感谢主' },
  { id: 'phrase:obey', kind: 'phrase', emoji: '🔥', label: '愿意顺服' },
];
