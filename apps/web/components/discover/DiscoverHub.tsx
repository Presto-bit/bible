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
  const manualRef = useRef(false);

  const go = useCallback(
    (href: string) => {
      navigateAppHref(href, router);
    },
    [router],
  );

  const applyPane = useCallback(
    (next: DiscoverPaneId, opts?: { manual?: boolean; syncUrl?: boolean }) => {
      setPane(next);
      writeDiscoverPaneSession(next);
      if (opts?.manual) manualRef.current = true;
      if (opts?.syncUrl !== false) {
        const q = new URLSearchParams(searchParams?.toString() || '');
        if (next === 'explore') q.set('pane', 'explore');
        else q.delete('pane');
        const qs = q.toString();
        router.replace(qs ? `/discover?${qs}` : '/discover', { scroll: false });
      }
    },
    [router, searchParams],
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
      // 当次会话曾切换则沿用；否则按有无好友
      const next = fromSession ?? defaultDiscoverPane(count);
      setPane(next);
      writeDiscoverPaneSession(next);
      setResolved(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [account.status, resolved, searchParams]);

  useEffect(() => {
    const urlPane = parseDiscoverPane(searchParams?.get('pane'));
    if (!urlPane || urlPane === pane) return;
    setPane(urlPane);
    writeDiscoverPaneSession(urlPane);
  }, [searchParams, pane]);

  useEffect(() => {
    if (!plusOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!plusRef.current?.contains(e.target as Node)) setPlusOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [plusOpen]);

  return (
    <main className="container discover-page discover-hub discover-im">
      <div className="discover-hub-seg" role="tablist" aria-label="发现分段">
        <div className="discover-hub-seg-main">
          <button
            type="button"
            role="tab"
            aria-selected={pane === 'peers'}
            className={`discover-hub-seg-btn${pane === 'peers' ? ' is-on' : ''}`}
            onClick={() => applyPane('peers', { manual: true })}
          >
            同路人
          </button>
          <span className="discover-hub-pipe" aria-hidden>
            |
          </span>
          <button
            type="button"
            role="tab"
            aria-selected={pane === 'explore'}
            className={`discover-hub-seg-btn${pane === 'explore' ? ' is-on' : ''}`}
            onClick={() => applyPane('explore', { manual: true })}
          >
            探索
          </button>
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

      {pane === 'peers' ? (
        <DiscoverTab paneActive={paneActive && resolved} hubEmbedded />
      ) : (
        <KnowledgeTopicsClient
          initialLayouts={initialLayouts}
          discoverEmbed
          paneActive={paneActive && resolved}
        />
      )}
    </main>
  );
}
