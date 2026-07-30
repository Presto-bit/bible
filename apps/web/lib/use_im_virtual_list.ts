'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

const DEFAULT_ESTIMATE = 96;
const DEFAULT_OVERSCAN = 14;
/** 超过该条数才开窗，短会话保持全量渲染 */
const ENABLE_AT = 48;

export type ImVirtualListResult = {
  enabled: boolean;
  start: number;
  end: number;
  paddingTop: number;
  paddingBottom: number;
  measureRef: (key: string, node: HTMLElement | null) => void;
};

/**
 * IM 消息列表窗口渲染：按滚动位置只挂载可见区附近消息，
 * 用 spacer 维持总高度；高度按 key 缓存，兼容顶部加载更早消息。
 */
export function useImVirtualList(opts: {
  itemKeys: string[];
  scrollRef: RefObject<HTMLElement | null>;
  estimateSize?: number;
  overscan?: number;
  enabled?: boolean;
  /** 强制保留挂载（焦点落地 / 长按菜单） */
  pinKeys?: Array<string | null | undefined>;
}): ImVirtualListResult {
  const {
    itemKeys,
    scrollRef,
    estimateSize = DEFAULT_ESTIMATE,
    overscan = DEFAULT_OVERSCAN,
    pinKeys,
  } = opts;
  const count = itemKeys.length;
  const enabled = opts.enabled ?? count >= ENABLE_AT;

  const sizesRef = useRef(new Map<string, number>());
  const measureRaf = useRef(0);
  const [tick, setTick] = useState(0);

  const sizeOf = useCallback(
    (key: string) => sizesRef.current.get(key) ?? estimateSize,
    [estimateSize],
  );

  const compute = useCallback((): Omit<ImVirtualListResult, 'measureRef' | 'enabled'> => {
    if (!enabled || count === 0) {
      return { start: 0, end: count, paddingTop: 0, paddingBottom: 0 };
    }

    const prefix = new Array<number>(count + 1);
    prefix[0] = 0;
    for (let i = 0; i < count; i++) {
      prefix[i + 1] = prefix[i]! + sizeOf(itemKeys[i]!);
    }
    const total = prefix[count]!;

    const el = scrollRef.current;
    const scrollTop = el?.scrollTop ?? Math.max(0, total);
    const viewport = el?.clientHeight ?? 640;
    const nearBottom = !el || total - scrollTop - viewport < 180;

    let start: number;
    let end: number;

    if (nearBottom) {
      end = count;
      // 底部附近：至少留出约一屏半 + overscan
      const keepPx = viewport * 1.6 + overscan * estimateSize;
      start = count;
      let acc = 0;
      while (start > 0 && acc < keepPx) {
        start -= 1;
        acc += sizeOf(itemKeys[start]!);
      }
      start = Math.max(0, start - overscan);
    } else {
      let lo = 0;
      let hi = count;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (prefix[mid]! < scrollTop) lo = mid + 1;
        else hi = mid;
      }
      start = Math.max(0, lo - 1 - overscan);

      const limit = scrollTop + viewport;
      end = start;
      while (end < count && prefix[end]! < limit) end += 1;
      end = Math.min(count, end + overscan);
    }

    if (pinKeys?.length) {
      for (const key of pinKeys) {
        if (!key) continue;
        const idx = itemKeys.indexOf(key);
        if (idx < 0) continue;
        start = Math.min(start, Math.max(0, idx - overscan));
        end = Math.max(end, Math.min(count, idx + 1 + overscan));
      }
    }

    return {
      start,
      end,
      paddingTop: prefix[start]!,
      paddingBottom: total - prefix[end]!,
    };
  }, [enabled, count, itemKeys, sizeOf, scrollRef, overscan, estimateSize, pinKeys, tick]);

  const [range, setRange] = useState(() => compute());

  const refresh = useCallback(() => {
    const next = compute();
    setRange((prev) =>
      prev.start === next.start
      && prev.end === next.end
      && prev.paddingTop === next.paddingTop
      && prev.paddingBottom === next.paddingBottom
        ? prev
        : next,
    );
  }, [compute]);

  useLayoutEffect(() => {
    refresh();
  }, [refresh, count, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => refresh();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => refresh())
        : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    };
  }, [enabled, scrollRef, refresh, count]);

  // 顶部 prepend：按新增条目估算高度把 scrollTop 顶回去，避免跳动
  const prevKeysRef = useRef<string[]>([]);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const prev = prevKeysRef.current;
    const next = itemKeys;
    prevKeysRef.current = next;
    if (!el || !prev.length || next.length <= prev.length) return;
    const anchor = prev[0]!;
    const idx = next.indexOf(anchor);
    if (idx <= 0) return;
    let added = 0;
    for (let i = 0; i < idx; i++) added += sizeOf(next[i]!);
    if (added > 0) el.scrollTop += added;
  }, [itemKeys, scrollRef, sizeOf]);

  const measureRef = useCallback(
    (key: string, node: HTMLElement | null) => {
      if (!enabled || !node) return;
      const h = node.getBoundingClientRect().height;
      if (!(h > 0)) return;
      const prev = sizesRef.current.get(key);
      if (prev !== undefined && Math.abs(prev - h) < 1.5) return;
      sizesRef.current.set(key, h);
      if (measureRaf.current) cancelAnimationFrame(measureRaf.current);
      measureRaf.current = requestAnimationFrame(() => {
        measureRaf.current = 0;
        setTick((n) => n + 1);
      });
    },
    [enabled],
  );

  if (!enabled) {
    return {
      enabled: false,
      start: 0,
      end: count,
      paddingTop: 0,
      paddingBottom: 0,
      measureRef: () => {},
    };
  }

  return {
    enabled: true,
    start: range.start,
    end: range.end,
    paddingTop: range.paddingTop,
    paddingBottom: range.paddingBottom,
    measureRef,
  };
}
