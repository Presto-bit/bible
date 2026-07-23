/** 沉浸祷告背景音乐：10 首原创氛围 loop（public/audio/pray） */

export type PrayAmbientTrack = {
  id: string;
  title: string;
  src: string;
};

export const PRAY_AMBIENT_TRACKS: readonly PrayAmbientTrack[] = [
  { id: 'dawn', title: '晨光', src: '/audio/pray/dawn.mp3' },
  { id: 'still', title: '宁静', src: '/audio/pray/still.mp3' },
  { id: 'brook', title: '溪流', src: '/audio/pray/brook.mp3' },
  { id: 'vesper', title: '晚祷', src: '/audio/pray/vesper.mp3' },
  { id: 'olive', title: '橄榄山', src: '/audio/pray/olive.mp3' },
  { id: 'rest', title: '安息', src: '/audio/pray/rest.mp3' },
  { id: 'cloud', title: '云端', src: '/audio/pray/cloud.mp3' },
  { id: 'deep', title: '深水', src: '/audio/pray/deep.mp3' },
  { id: 'lamp', title: '灯火', src: '/audio/pray/lamp.mp3' },
  { id: 'grace', title: '恩典', src: '/audio/pray/grace.mp3' },
] as const;

const TRACK_KEY = 'presto_pray_ambient_track';
const MUTE_KEY = 'presto_pray_ambient_mute';

export function readPrayAmbientTrackId(): string {
  if (typeof window === 'undefined') return PRAY_AMBIENT_TRACKS[0]!.id;
  const saved = window.localStorage.getItem(TRACK_KEY);
  if (saved && PRAY_AMBIENT_TRACKS.some((t) => t.id === saved)) return saved;
  // 默认按日轮换一首，避免总是同一曲
  const day = Math.floor(Date.now() / 86_400_000);
  return PRAY_AMBIENT_TRACKS[day % PRAY_AMBIENT_TRACKS.length]!.id;
}

export function writePrayAmbientTrackId(id: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TRACK_KEY, id);
}

export function readPrayAmbientMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(MUTE_KEY) === '1';
}

export function writePrayAmbientMuted(muted: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
}

export function prayAmbientById(id: string): PrayAmbientTrack {
  return PRAY_AMBIENT_TRACKS.find((t) => t.id === id) ?? PRAY_AMBIENT_TRACKS[0]!;
}
