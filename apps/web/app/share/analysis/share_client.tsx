'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { captureAcquisitionFromLocation } from '@/lib/acquisition';
import { explainVerseQuestion } from '@/lib/assistant_prefill';
import { openPwaInstallSheet } from '@/components/InstallPwaGuide';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { detectInstallPlatform } from '@/lib/pwa_platform';

export function AnalysisShareClient({
  refLabel,
  refParam,
  more,
}: {
  refLabel: string;
  refParam: string;
  more?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    captureAcquisitionFromLocation();
    setShowInstall(detectInstallPlatform() !== 'standalone');
  }, []);

  const askHref = refParam
    ? `/assistant?ref=${encodeURIComponent(refParam)}&q=${encodeURIComponent(explainVerseQuestion(refLabel || refParam))}&scene=verse_full`
    : '/assistant';

  const readHref = refParam
    ? readerHrefFromRef(refParam) || '/reader'
    : '/reader';

  const hasMore = Boolean(more?.trim());

  return (
    <>
      {hasMore ? (
        <div className="analysis-share-more-block">
          {expanded ? (
            <p className="analysis-share-more">{more}</p>
          ) : null}
          <button
            type="button"
            className="text-link analysis-share-expand"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? '收起' : '展开更多'}
          </button>
        </div>
      ) : null}

      <div className="share-landing-ctas analysis-share-ctas">
        <Link className="btn btn-primary" href={askHref}>
          问小爱：继续解读
        </Link>
        <Link className="btn" href={readHref}>
          我也在读这一段
        </Link>
        {showInstall ? (
          <button type="button" className="btn" onClick={() => openPwaInstallSheet()}>
            保存到主屏幕
          </button>
        ) : null}
      </div>
    </>
  );
}
