'use client';

import '@/styles/discover_hub.css';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DiscoverTab from '@/components/tabs/DiscoverTab';
import { KnowledgeTopicsClient } from '@/components/knowledge/KnowledgeTopicsClient';
import { Pressable } from '@/components/ui/Pressable';
import { api, type KnowledgeLayoutSummary } from '@/lib/api';
import { navigateAppHref } from '@/lib/pwa_tab_nav';
import { useAccountReady } from '@/lib/use_account_ready';
import { DiscoverTabSkeleton } from '@/components/social/ImThreadSkeleton';
import {
  defaultDiscoverPane,
  parseDiscoverPane,
  readDiscoverPaneSession,
  writeDiscoverPaneSession,
  type DiscoverPaneId,
} from '@/lib/discover_pane';
import { releaseKnowledgeImmersiveChrome } from '@/lib/knowledge_nav';

type Props = {
  paneActive?: boolean;
  /** 服务端预取的探索列表；无则客户端自拉 */
  initialLayouts?: KnowledgeLayoutSummary[];
};

export default function DiscoverHub(props: Props) {
  return (
    <Suspense fallback={<DiscoverTabSkeleton />}>
      <DiscoverHubInner {...props} />
    </Suspense>
  );
}

function DiscoverHubInner({
  paneActive = true,
  initialLayouts = [],
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const account = useAccountReady();
  const [pane, setPane] = useState<DiscoverPaneId>('peers');
  const [resolved, setResolved] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const plusRef = useRef<HTMLDivElement | null>(null);
  const segMainRef = useRef<HTMLDivElement | null>(null);
  const peersBtnRef = useRef<HTMLButtonElement | null>(null);
  const exploreBtnRef = useRef<HTMLButtonElement | null>(null);
  const [ink, setInk] = useState({ left: 0, width: 0, ready: false });
  /** 手动切换后忽略一次过期的 URL 回写 */
  const ignoreUrlRef = useRef(false);

  const updateInk = useCallback(() => {
    const main = segMainRef.current;
    const btn = pane === 'peers' ? peersBtnRef.current : exploreBtnRef.current;
    if (!main || !btn) return;
    const mr = main.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    setInk({ left: br.left - mr.left, width: br.width, ready: true });
  }, [pane]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => updateInk());
    window.addEventListener('resize', updateInk);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener('resize', updateInk);
    };
  }, [updateInk, resolved, pane]);

  const go = useCallback(
    (href: string) => {
      navigateAppHref(href, router);
    },
    [router],
  );

  const syncUrl = useCallback(
    (next: DiscoverPaneId) => {
      const q = new URLSearchParams(searchParams?.toString() || '');
      q.set('pane', next);
      const qs = q.toString();
      router.replace(`/discover?${qs}`, { scroll: false });
    },
    [router, searchParams],
  );

  const applyPane = useCallback(
    (next: DiscoverPaneId) => {
      ignoreUrlRef.current = true;
      setPane(next);
      writeDiscoverPaneSession(next);
      syncUrl(next);
      // URL 追上后再允许外部深链改写
      window.setTimeout(() => {
        ignoreUrlRef.current = false;
      }, 400);
    },
    [syncUrl],
  );

  useEffect(() => {
    if (resolved) return;
    let cancelled = false;

    const fromUrl = parseDiscoverPane(searchParams?.get('pane'));
    if (fromUrl) {
      setPane(fromUrl);
      writeDiscoverPaneSession(fromUrl);
      setResolved(true);
      return;
    }

    const fromSession = readDiscoverPaneSession();

    void (async () => {
      let count = 0;
      try {
        if (account.status === 'ready') {
          const res = await api.friends();
          count = Array.isArray(res.friends) ? res.friends.length : 0;
        }
      } catch {
        count = 0;
      }
      if (cancelled) return;
      const next = fromSession ?? defaultDiscoverPane(count);
      setPane(next);
      writeDiscoverPaneSession(next);
      // 显式写入 pane，避免「无 query = 同路人」与手动切换打架
      const q = new URLSearchParams(searchParams?.toString() || '');
      q.set('pane', next);
      router.replace(`/discover?${q.toString()}`, { scroll: false });
      setResolved(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [account.status, resolved, searchParams, router]);

  // 只跟 URL，不跟 pane，避免「点同路人 → URL 未变 → 又被拉回探索」
  useEffect(() => {
    if (ignoreUrlRef.current) return;
    const urlPane = parseDiscoverPane(searchParams?.get('pane'));
    if (!urlPane) return;
    setPane((prev) => (prev === urlPane ? prev : urlPane));
    writeDiscoverPaneSession(urlPane);
  }, [searchParams]);

  useEffect(() => {
    if (!plusOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!plusRef.current?.contains(e.target as Node)) setPlusOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [plusOpen]);

  useEffect(() => {
    if (!paneActive || pane !== 'explore') return;
    // 回到探索列表时卸掉可能卡住的手稿黑垫
    releaseKnowledgeImmersiveChrome();
  }, [paneActive, pane]);

  return (
    <main className="container discover-page discover-hub discover-im">
      <div className="discover-hub-seg" role="tablist" aria-label="发现分段">
        <div
          ref={segMainRef}
          className="discover-hub-seg-main"
          data-pane={pane}
        >
          <button
            ref={peersBtnRef}
            type="button"
            role="tab"
            aria-selected={pane === 'peers'}
            className={`discover-hub-seg-btn${pane === 'peers' ? ' is-on' : ''}`}
            onClick={() => applyPane('peers')}
          >
            同路人
          </button>
          <button
            ref={exploreBtnRef}
            type="button"
            role="tab"
            aria-selected={pane === 'explore'}
            className={`discover-hub-seg-btn${pane === 'explore' ? ' is-on' : ''}`}
            onClick={() => applyPane('explore')}
          >
            探索
          </button>
          <span
            className={`discover-hub-seg-ink${ink.ready ? ' is-ready' : ''}`}
            aria-hidden
            style={{
              transform: `translateX(${ink.left}px)`,
              width: ink.width,
            }}
          />
        </div>
        <span className="discover-hub-seg-spacer" aria-hidden />
        {pane === 'peers' ? (
          <div className="discover-hub-plus-wrap" ref={plusRef}>
            <Pressable
              className={`discover-hub-plus${plusOpen ? ' is-open' : ''}`}
              aria-label="添加"
              aria-expanded={plusOpen}
              onTap={() => setPlusOpen((v) => !v)}
            >
              ＋
            </Pressable>
            {plusOpen ? (
              <div className="discover-hub-plus-menu" role="menu">
                <Pressable
                  role="menuitem"
                  onTap={() => {
                    setPlusOpen(false);
                    go('/friend/add');
                  }}
                >
                  加好友
                </Pressable>
                <Pressable
                  role="menuitem"
                  onTap={() => {
                    setPlusOpen(false);
                    go('/group/create');
                  }}
                >
                  新建群
                </Pressable>
                <Pressable
                  role="menuitem"
                  onTap={() => {
                    setPlusOpen(false);
                    go('/discover/join');
                  }}
                >
                  加入群
                </Pressable>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* 双栏常挂载，避免切换闪空 / 重复请求 */}
      <div
        className="discover-hub-pane"
        hidden={pane !== 'peers'}
        aria-hidden={pane !== 'peers'}
      >
        <DiscoverTab
          paneActive={paneActive && resolved && pane === 'peers'}
          hubEmbedded
          onGoExplore={() => applyPane('explore')}
        />
      </div>
      <div
        className="discover-hub-pane"
        hidden={pane !== 'explore'}
        aria-hidden={pane !== 'explore'}
      >
        <KnowledgeTopicsClient
          initialLayouts={initialLayouts}
          discoverEmbed
          paneActive={paneActive && resolved && pane === 'explore'}
        />
      </div>
    </main>
  );
}
