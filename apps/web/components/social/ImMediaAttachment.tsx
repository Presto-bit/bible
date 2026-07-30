'use client';

/** 聊天音视频气泡：仿微信缩略 + 点播 */

import { useCallback, useEffect, useRef, useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import {
  clearExclusiveAudio,
  detectImMediaKind,
  formatMediaDuration,
  playExclusiveAudio,
} from '@/lib/im_av';

type Props = {
  url: string;
  fileName?: string | null;
  mime?: string | null;
  messageKind?: string | null;
  sizeBytes?: number | null;
  /** 点普通文件时的回退 */
  onOpenFile?: () => void;
};

function ImVideoPlayer({
  url,
  fileName,
  onClose,
}: {
  url: string;
  fileName?: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <AppBodyPortal>
      <div className="im-video-player" role="dialog" aria-modal="true" aria-label={fileName || '视频'}>
        <button type="button" className="im-video-player-backdrop" aria-label="关闭" onClick={onClose} />
        <div className="im-video-player-stage">
          <video
            className="im-video-player-el"
            src={url}
            controls
            playsInline
            autoPlay
            preload="metadata"
          />
          <button type="button" className="im-video-player-close" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </AppBodyPortal>
  );
}

function ImAudioBubble({ url, fileName }: { url: string; fileName?: string | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onPlay = () => {
      playExclusiveAudio(el);
      setPlaying(true);
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
      clearExclusiveAudio(el);
    };
    const onTime = () => setCurrent(el.currentTime || 0);
    const onMeta = () => setDuration(el.duration || 0);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      clearExclusiveAudio(el);
    };
  }, []);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      playExclusiveAudio(el);
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  };

  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  const label = playing ? formatMediaDuration(current) : formatMediaDuration(duration || 0);

  return (
    <div className="im-audio-bubble">
      <audio ref={audioRef} src={url} preload="metadata" />
      <button type="button" className="im-audio-play" aria-label={playing ? '暂停' : '播放'} onClick={toggle}>
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="im-audio-track" aria-hidden>
        <span className="im-audio-track-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="im-audio-time">{label}</span>
      {fileName ? <span className="im-audio-name muted">{fileName}</span> : null}
    </div>
  );
}

function ImVideoBubble({
  url,
  fileName,
  onOpen,
}: {
  url: string;
  fileName?: string | null;
  onOpen: () => void;
}) {
  const [duration, setDuration] = useState(0);

  return (
    <button type="button" className="im-video-bubble" onClick={onOpen} aria-label="播放视频">
      <video
        className="im-video-thumb"
        src={url}
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
      />
      <span className="im-video-play-icon" aria-hidden>
        ▶
      </span>
      {duration > 0 ? <span className="im-video-duration">{formatMediaDuration(duration)}</span> : null}
      {fileName ? <span className="sr-only">{fileName}</span> : null}
    </button>
  );
}

export function ImMediaAttachment({
  url,
  fileName,
  mime,
  messageKind,
  onOpenFile,
}: Props) {
  const kind = detectImMediaKind(mime, fileName, messageKind);
  const [videoOpen, setVideoOpen] = useState(false);
  const openVideo = useCallback(() => setVideoOpen(true), []);

  if (kind === 'audio') {
    return <ImAudioBubble url={url} fileName={fileName} />;
  }
  if (kind === 'video') {
    return (
      <>
        <ImVideoBubble url={url} fileName={fileName} onOpen={openVideo} />
        {videoOpen ? (
          <ImVideoPlayer url={url} fileName={fileName} onClose={() => setVideoOpen(false)} />
        ) : null}
      </>
    );
  }
  if (onOpenFile) {
    return (
      <button type="button" className="im-attach-file-btn" onClick={onOpenFile}>
        {fileName || '附件'}
      </button>
    );
  }
  return <span>{fileName || '附件'}</span>;
}
