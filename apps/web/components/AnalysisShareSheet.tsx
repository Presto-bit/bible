'use client';

import {
  analysisShareSiteOrigin,
  buildAnalysisSharePack,
  extractShareCopy,
} from '@/lib/analysis_share';
import { createAnalysisShareSnapshot, effectiveId, type Citation } from '@/lib/api';
import { shareAnalysis } from '@/lib/share_analysis';
import { stripFollowups } from '@/lib/assistant_format';
import { ShareToSocialSheet } from '@/components/ShareToSocialSheet';
import { useMemo, useState } from 'react';

type Props = {
  refLabel: string;
  refParam?: string;
  answerText: string;
  citations?: Citation[];
  onClose: () => void;
  onToast?: (msg: string) => void;
};

function looksLikeVerseRef(ref?: string): boolean {
  const r = (ref || '').trim();
  if (!r || r === 'FREE' || r === '小爱的解读') return false;
  return /^[A-Za-z0-9]+\.\d+/.test(r) || /[\u4e00-\u9fff].*\d/.test(r);
}

export function AnalysisShareSheet({
  refLabel,
  refParam,
  answerText,
  citations,
  onClose,
  onToast,
}: Props) {
  const [socialOpen, setSocialOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [socialPayload, setSocialPayload] = useState<{
    ref: string;
    refLabel: string;
    body: string;
  } | null>(null);

  const clean = useMemo(() => stripFollowups(answerText), [answerText]);
  const preview = useMemo(() => {
    const { insight } = extractShareCopy(clean, refLabel);
    return insight;
  }, [clean, refLabel]);

  const shareExternal = async () => {
    setBusy(true);
    setErr(null);
    try {
      const result = await shareAnalysis({
        answerText: clean,
        refLabel,
        refParam,
        citations,
      });
      if (result === 'cancelled') return;
      if (result === 'failed') {
        setErr('分享失败');
        return;
      }
      onToast?.(result === 'copied' ? '已复制链接与摘要' : '已调起分享');
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openSocial = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { lead, insight } = extractShareCopy(clean, refLabel);
      let snapshotId: string | undefined;
      try {
        const snap = await createAnalysisShareSnapshot({
          ref_label: refLabel,
          ref_param: refParam,
          answer_markdown: clean,
          lead,
          citations,
        });
        snapshotId = snap.id;
      } catch {
        snapshotId = undefined;
      }
      const pack = buildAnalysisSharePack({
        answerText: clean,
        refLabel,
        refParam,
        sharerUserCode: effectiveId(),
        snapshotId,
      });
      const pathOrUrl = pack.urlFor('system_share');
      const origin = analysisShareSiteOrigin();
      const url = pathOrUrl.startsWith('http')
        ? pathOrUrl
        : `${origin}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
      const body = `${insight}\n${url}`.slice(0, 1900);
      const verseRef = looksLikeVerseRef(refParam)
        ? (refParam as string)
        : looksLikeVerseRef(refLabel)
          ? refLabel
          : '';
      setSocialPayload({
        ref: verseRef || 'FREE',
        refLabel: refLabel || '小爱的解读',
        body,
      });
      setSocialOpen(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (socialOpen && socialPayload) {
    return (
      <ShareToSocialSheet
        ref={socialPayload.ref}
        refLabel={socialPayload.refLabel}
        body={socialPayload.body}
        kind="analysis"
        defaultGroupMode="verse"
        onClose={() => {
          setSocialOpen(false);
          onClose();
        }}
        onDone={(target) => onToast?.(`已分享到 ${target}`)}
      />
    );
  }

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="sheet card analysis-share-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="分享小爱解读"
      >
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row group-settings-sheet-head">
          <button type="button" className="text-link" onClick={onClose}>
            关闭
          </button>
          <strong>分享解读</strong>
          <span style={{ width: 36 }} aria-hidden />
        </div>
        <p className="muted analysis-share-sheet-preview">{preview}</p>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          {refLabel}
        </p>
        <div className="daily-verse-share-actions">
          <button
            type="button"
            className="btn btn-block"
            disabled={busy}
            onClick={() => void shareExternal()}
          >
            系统分享
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            disabled={busy}
            onClick={() => void openSocial()}
          >
            分享到群 / 私信
          </button>
        </div>
        {err ? (
          <p className="muted" role="alert" style={{ marginTop: 8 }}>
            {err}
          </p>
        ) : null}
      </div>
    </div>
  );
}
