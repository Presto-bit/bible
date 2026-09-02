'use client';

import ReaderSheetPortal from '@/components/reader/ReaderSheetPortal';
import type { ReaderAudioSettings } from '@/lib/reader_audio';

function SegRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="reader-audio-settings-section">
      <div className="reader-audio-settings-label">{label}</div>
      <div className="reader-audio-segmented" role="tablist" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={value === o.id}
            className={value === o.id ? 'is-active' : ''}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="reader-audio-toggle-row">
      <span className="reader-audio-toggle-copy">
        <span>{label}</span>
        {hint ? <span className="reader-audio-toggle-hint">{hint}</span> : null}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function ReaderAudioSettingsSheet({
  open,
  onClose,
  settings,
  onChange,
  copyright,
}: {
  open: boolean;
  onClose: () => void;
  settings: ReaderAudioSettings;
  onChange: (patch: Partial<ReaderAudioSettings>) => void;
  copyright?: string;
}) {
  if (!open) return null;

  return (
    <ReaderSheetPortal onClose={onClose} title="朗读" sheetClassName="sheet card reader-settings-sheet">
      <SegRow
        label="倍速"
        value={String(settings.speed)}
        onChange={(id) => onChange({ speed: Number(id) })}
        options={[
          { id: '0.75', label: '0.75' },
          { id: '1', label: '1' },
          { id: '1.25', label: '1.25' },
          { id: '1.5', label: '1.5' },
        ]}
      />
      <SegRow
        label="定时停止"
        value={settings.sleepTimer}
        onChange={(id) => onChange({ sleepTimer: id as ReaderAudioSettings['sleepTimer'] })}
        options={[
          { id: 'off', label: '关' },
          { id: '15', label: '15分' },
          { id: '30', label: '30分' },
          { id: 'chapter', label: '本章末' },
        ]}
      />
      <div className="reader-audio-settings-section">
        <div className="reader-audio-settings-label">播放</div>
        <ToggleRow
          label="锁屏或切换应用后继续"
          checked={settings.backgroundPlay}
          onChange={(v) => onChange({ backgroundPlay: v })}
        />
        <ToggleRow
          label="离开圣经 Tab 时暂停"
          hint="离开 Tab 优先于「继续播放」。"
          checked={settings.pauseOnTabLeave}
          onChange={(v) => onChange({ pauseOnTabLeave: v })}
        />
        <ToggleRow
          label="播放中滑动换章后继续"
          checked={settings.continueOnChapterSwipe}
          onChange={(v) => onChange({ continueOnChapterSwipe: v })}
        />
      </div>
      <SegRow
        label="连续朗读"
        value={settings.continuousChapter ? 'on' : 'off'}
        onChange={(id) => onChange({ continuousChapter: id === 'on' })}
        options={[
          { id: 'off', label: '关' },
          { id: 'on', label: '本章结束后下一章' },
        ]}
      />
      <p className="reader-audio-settings-foot">
        朗读需联网流式播放，不提供音频文件下载。iOS 锁屏可能因系统限制暂停，可重新点朗读。
      </p>
      {copyright ? <p className="reader-audio-settings-copy">{copyright}</p> : null}
    </ReaderSheetPortal>
  );
}
