'use client';

import { useRef, useState } from 'react';

const MAX_MS = 60_000;
const MIN_MS = 500;

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export function voiceRecorderSupported(): boolean {
  return (
    typeof window !== 'undefined'
    && typeof MediaRecorder !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

export function formatVoiceDurationLabel(sec: number): string {
  const s = Math.max(1, Math.round(sec));
  if (s < 60) return `${s}″`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}′${String(r).padStart(2, '0')}″`;
}

type Options = {
  /** 松手且未取消时回调录音文件 */
  onRecorded: (file: File, durationSec: number) => void;
  onUnsupported?: () => void;
  onError?: (message: string) => void;
};

/**
 * 微信式按住录音：松手发送 audio File，上滑取消。
 * 最长 60s 自动结束。
 */
export function useVoiceRecorder({ onRecorded, onUnsupported, onError }: Options) {
  const [recording, setRecording] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startYRef = useRef(0);
  const cancelRef = useRef(false);
  const startedAtRef = useRef(0);
  const tickRef = useRef(0);
  const maxTimerRef = useRef(0);
  const mimeRef = useRef('');
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const clearTimers = () => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    if (maxTimerRef.current) window.clearTimeout(maxTimerRef.current);
    tickRef.current = 0;
    maxTimerRef.current = 0;
  };

  const finish = (willCancel: boolean) => {
    clearTimers();
    setRecording(false);
    setCancelArmed(false);
    setElapsedSec(0);
    const rec = recRef.current;
    recRef.current = null;
    if (!rec) {
      cleanupStream();
      return;
    }
    const durationSec = (Date.now() - startedAtRef.current) / 1000;
    rec.onstop = () => {
      const mime = mimeRef.current || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];
      cleanupStream();
      if (willCancel || durationSec * 1000 < MIN_MS || blob.size < 64) return;
      const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
      const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mime });
      onRecordedRef.current(file, durationSec);
    };
    try {
      if (rec.state !== 'inactive') rec.stop();
      else {
        cleanupStream();
      }
    } catch {
      cleanupStream();
    }
  };

  const startVoice = async (e: React.PointerEvent) => {
    if (!voiceRecorderSupported()) {
      onUnsupported?.();
      return;
    }
    const mime = pickMime();
    if (!mime) {
      onUnsupported?.();
      return;
    }
    e.preventDefault();
    startYRef.current = e.clientY;
    cancelRef.current = false;
    setCancelArmed(false);
    chunksRef.current = [];
    mimeRef.current = mime;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recRef.current = rec;
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      startedAtRef.current = Date.now();
      setElapsedSec(0);
      setRecording(true);
      rec.start(200);
      tickRef.current = window.setInterval(() => {
        setElapsedSec(Math.min(60, Math.round((Date.now() - startedAtRef.current) / 1000)));
      }, 200);
      maxTimerRef.current = window.setTimeout(() => {
        finish(false);
      }, MAX_MS);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      cleanupStream();
      setRecording(false);
      onError?.('无法使用麦克风，请在系统设置中允许');
    }
  };

  const onVoiceMove = (e: React.PointerEvent) => {
    if (!recording) return;
    e.preventDefault();
    const armed = startYRef.current - e.clientY > 60;
    cancelRef.current = armed;
    setCancelArmed(armed);
  };

  const endVoice = () => {
    if (!recording) return;
    finish(cancelRef.current);
  };

  return {
    recording,
    cancelArmed,
    elapsedSec,
    startVoice,
    onVoiceMove,
    endVoice,
  };
}
