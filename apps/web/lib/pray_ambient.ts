/** 沉浸祷告背景音乐：Kevin MacLeod（CC BY 4.0）灵修向曲目，进入时随机一首 */

export type PrayAmbientTrack = {
  id: string;
  title: string;
  src: string;
  artist: string;
};

/** 公开授权曲目（Creative Commons Attribution 4.0） */
export const PRAY_AMBIENT_TRACKS: readonly PrayAmbientTrack[] = [
  {
    id: 'meditation_01',
    title: 'Meditation Impromptu 01',
    src: '/audio/pray/meditation_01.mp3',
    artist: 'Kevin MacLeod',
  },
  {
    id: 'meditation_02',
    title: 'Meditation Impromptu 02',
    src: '/audio/pray/meditation_02.mp3',
    artist: 'Kevin MacLeod',
  },
  {
    id: 'meditation_03',
    title: 'Meditation Impromptu 03',
    src: '/audio/pray/meditation_03.mp3',
    artist: 'Kevin MacLeod',
  },
  {
    id: 'avalon',
    title: 'Shores of Avalon',
    src: '/audio/pray/avalon.mp3',
    artist: 'Kevin MacLeod',
  },
  {
    id: 'edge',
    title: 'Past the Edge',
    src: '/audio/pray/edge.mp3',
    artist: 'Kevin MacLeod',
  },
  {
    id: 'dreamy',
    title: 'Dreamy Flashback',
    src: '/audio/pray/dreamy.mp3',
    artist: 'Kevin MacLeod',
  },
  {
    id: 'piano',
    title: 'Relaxing Piano Music',
    src: '/audio/pray/piano.mp3',
    artist: 'Kevin MacLeod',
  },
  {
    id: 'frozen',
    title: 'Frozen Star',
    src: '/audio/pray/frozen.mp3',
    artist: 'Kevin MacLeod',
  },
  {
    id: 'dawn',
    title: 'Lightless Dawn',
    src: '/audio/pray/dawn.mp3',
    artist: 'Kevin MacLeod',
  },
  {
    id: 'healing',
    title: 'Healing',
    src: '/audio/pray/healing.mp3',
    artist: 'Kevin MacLeod',
  },
] as const;

const MUTE_KEY = 'presto_pray_ambient_mute';

/** 每次进入会话随机选一首 */
export function pickRandomPrayAmbientTrack(): PrayAmbientTrack {
  const i = Math.floor(Math.random() * PRAY_AMBIENT_TRACKS.length);
  return PRAY_AMBIENT_TRACKS[i]!;
}

export function readPrayAmbientMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(MUTE_KEY) === '1';
}

export function writePrayAmbientMuted(muted: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
}

export function prayAmbientAttribution(): string {
  return 'Music by Kevin MacLeod (incompetech.com) · CC BY 4.0';
}
