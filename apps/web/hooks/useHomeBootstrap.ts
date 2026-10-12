/** 首页 bootstrap：轻量内存去重（不强制 swr 依赖；有 swr 时可再换）。 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { homeApi, type HomeBootstrap } from '@/lib/api/home';
import { chinaTodayYmd } from '@/lib/daily_clock';

type CacheEntry = { at: number; data: HomeBootstrap };
const cache = new Map<string, CacheEntry>();
const DEDUPE_MS = 8_000;

export function useHomeBootstrap(previewCampaignId?: string) {
  const day = chinaTodayYmd();
  const key = `${day}|${previewCampaignId || ''}`;
  const [data, setData] = useState<HomeBootstrap | undefined>(() => cache.get(key)?.data);
  const [error, setError] = useState<Error | undefined>();
  const [isLoading, setIsLoading] = useState(!cache.get(key));
  const gen = useRef(0);

  const load = useCallback(async () => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < DEDUPE_MS) {
      setData(hit.data);
      setIsLoading(false);
      return hit.data;
    }
    const my = ++gen.current;
    setIsLoading(true);
    try {
      const boot = await homeApi.homeBootstrap(previewCampaignId);
      if (my !== gen.current) return boot;
      cache.set(key, { at: Date.now(), data: boot });
      setData(boot);
      setError(undefined);
      return boot;
    } catch (e) {
      if (my !== gen.current) return undefined;
      setError(e instanceof Error ? e : new Error(String(e)));
      return undefined;
    } finally {
      if (my === gen.current) setIsLoading(false);
    }
  }, [key, previewCampaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, isLoading, mutate: load };
}
