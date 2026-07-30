/** IM 附件类型与独占播放 */

export type ImMediaKind = 'image' | 'video' | 'audio' | 'file';

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|$)/i;
const AUDIO_EXT = /\.(mp3|m4a|wav|aac|ogg|oga)(\?|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|heic|bmp)(\?|$)/i;

export function detectImMediaKind(
  mime?: string | null,
  fileName?: string | null,
  messageKind?: string | null,
): ImMediaKind {
  const k = (messageKind || '').toLowerCase();
  if (k === 'image' || k === 'video' || k === 'audio') return k;
  const m = (mime || '').split(';')[0].trim().toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  const name = (fileName || '').toLowerCase();
  if (IMAGE_EXT.test(name)) return 'image';
  if (VIDEO_EXT.test(name)) return 'video';
  if (AUDIO_EXT.test(name)) return 'audio';
  return 'file';
}

export function formatMediaDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

let exclusiveAudio: HTMLAudioElement | null = null;

/** 同时只播一条语音；切到其他语音时暂停上一条。 */
export function playExclusiveAudio(el: HTMLAudioElement) {
  if (exclusiveAudio && exclusiveAudio !== el) {
    try {
      exclusiveAudio.pause();
    } catch {
      /* ignore */
    }
  }
  exclusiveAudio = el;
}

export function clearExclusiveAudio(el?: HTMLAudioElement | null) {
  if (!el || exclusiveAudio === el) exclusiveAudio = null;
}
