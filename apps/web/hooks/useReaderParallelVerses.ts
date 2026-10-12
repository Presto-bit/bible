/** 对照栏经文加载。 */
'use client';

import { useEffect, useState } from 'react';
import type { BibleVersion, Verse } from '@/lib/api';
import { bibleChapter } from '@/lib/bible_client';
import { versionDisplayLabel } from '@/lib/bible_version';
import type { ReadingLayout } from '@/lib/reader_settings';

export function useReaderParallelVerses(opts: {
  layout: ReadingLayout;
  bookId: string;
  chapter: number;
  parallelVer: string;
  versions: BibleVersion[] | null;
}) {
  const { layout, bookId, chapter, parallelVer, versions } = opts;
  const [parallelVerses, setParallelVerses] = useState<Verse[]>([]);
  const [parallelLoading, setParallelLoading] = useState(false);
  const [parallelError, setParallelError] = useState<string | null>(null);

  useEffect(() => {
    if (layout !== 'parallel') {
      setParallelVerses([]);
      setParallelError(null);
      setParallelLoading(false);
      return;
    }
    let cancelled = false;
    setParallelLoading(true);
    setParallelError(null);
    void bibleChapter(bookId, chapter, parallelVer)
      .then((verses) => {
        if (cancelled) return;
        if (!verses?.length) {
          const label = versionDisplayLabel(parallelVer, versions);
          setParallelError(`${label} 暂无经文`);
          setParallelVerses([]);
          return;
        }
        setParallelVerses(verses);
        setParallelError(null);
      })
      .catch(() => {
        if (cancelled) return;
        const label = versionDisplayLabel(parallelVer, versions);
        setParallelError(`${label} 加载失败`);
        setParallelVerses([]);
      })
      .finally(() => {
        if (!cancelled) setParallelLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [layout, bookId, chapter, parallelVer, versions]);

  return { parallelVerses, parallelLoading, parallelError };
}
