'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { captureAcquisitionFromLocation } from '@/lib/acquisition';
import { explainVerseQuestion } from '@/lib/assistant_prefill';
import { readerHrefFromRef } from '@/lib/group_footprint';

export function AnalysisShareClient({
  refLabel,
  refParam,
}: {
  refLabel: string;
  refParam: string;
}) {
  useEffect(() => {
    captureAcquisitionFromLocation();
  }, []);

  const askHref = refParam
    ? `/assistant?ref=${encodeURIComponent(refParam)}&q=${encodeURIComponent(explainVerseQuestion(refLabel || refParam))}&scene=verse_full`
    : '/assistant';

  const readHref = refParam
    ? readerHrefFromRef(refParam) || '/reader'
    : '/reader';

  return (
    <div className="analysis-share-ctas">
      <Link className="btn" href={askHref}>
        问小爱：继续解读
      </Link>
      <Link className="btn btn-ghost" href={readHref}>
        我也在读这一段
      </Link>
    </div>
  );
}
