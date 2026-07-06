'use client';

import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { markLocalDataCreated } from '@/lib/account_guide';
import { stashCreatedGroup } from '@/lib/groups_refresh';

function friendlyJoinError(raw: string): string {
  const s = (raw || '').toLowerCase();
  if (s.includes('404') || s.includes('不存在') || s.includes('无效') || s.includes('not found')) {
    return '邀请码无效，请向群主确认后重试';
  }
  if (s.includes('已在') || s.includes('already') || s.includes('已加入')) {
    return '你已在该群中';
  }
  if (s.includes('满') || s.includes('full')) {
    return '群人数已满，暂时无法加入';
  }
  if (s.includes('网络') || s.includes('fetch') || s.includes('failed')) {
    return '网络异常，请稍后重试';
  }
  return raw || '加入失败，请稍后重试';
}

function JoinGroupInner() {
  useEdgeSwipeBack({ href: '/discover' });
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [pasteHint, setPasteHint] = useState(false);

  useEffect(() => {
    const fromUrl = (searchParams.get('code') || searchParams.get('join_code') || '').trim().toUpperCase();
    if (fromUrl) setCode(fromUrl);
    inputRef.current?.focus();
  }, [searchParams]);

  const submit = async (raw?: string) => {
    const c = (raw ?? code).trim().toUpperCase();
    if (!c) {
      setMsg('请输入邀请码');
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const g = await api.joinGroup(c);
      stashCreatedGroup({
        id: g.id,
        name: g.name,
        join_code: c,
        role: 'member',
      });
      markLocalDataCreated();
      router.replace(`/discover/group/${g.id}`);
    } catch (e) {
      setMsg(friendlyJoinError(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const pasteCode = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim().toUpperCase();
      const matched = text.match(/[A-Z0-9]{4,12}/)?.[0];
      if (matched) {
        setCode(matched);
        setPasteHint(true);
        window.setTimeout(() => setPasteHint(false), 1600);
        return;
      }
      setMsg('剪贴板里没有识别到邀请码');
    } catch {
      setMsg('无法读取剪贴板，请手动输入邀请码');
    }
  };

  return (
    <main className="container join-group-page">
      <header className="page-head">
        <PageBackBar href="/discover" label="发现" />
        <h2 className="page-head-title">加入共读群</h2>
      </header>

      <div className="join-group-hero card card-2">
        <p className="join-group-kicker">有邀请码？马上加入</p>
        <p className="muted join-group-desc">
          向群主或好友索取邀请码，输入后即可一起读经、打卡。
        </p>
      </div>

      <label className="join-group-label" htmlFor="join-code-input">邀请码</label>
      <div className="join-group-input-row">
        <input
          id="join-code-input"
          ref={inputRef}
          className="search-input join-group-input"
          placeholder="输入 6 位邀请码"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
        <button type="button" className="join-group-paste" onClick={() => void pasteCode()}>
          {pasteHint ? '已粘贴' : '粘贴'}
        </button>
      </div>

      <button
        type="button"
        className="btn join-group-submit"
        disabled={busy || !code.trim()}
        onClick={() => void submit()}
      >
        {busy ? '加入中…' : '加入群'}
      </button>

      {msg && (
        <p className="join-group-error" role="alert">{msg}</p>
      )}

      <p className="muted join-group-foot">
        还没有邀请码？
        <Link href="/group/create" className="text-link" style={{ marginLeft: 6 }}>
          创建一个共读群
        </Link>
      </p>
    </main>
  );
}

export default function JoinGroupPage() {
  return (
    <Suspense fallback={<main className="container"><p className="muted">加载中…</p></main>}>
      <JoinGroupInner />
    </Suspense>
  );
}
