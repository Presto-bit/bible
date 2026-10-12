'use client';

import '@/styles/external_browser.css';

import { useCallback, useEffect, useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import {
  EXTERNAL_BROWSER_OPEN,
  openInSystemBrowser,
  type ExternalBrowserChrome,
  type ExternalBrowserInviteCampaign,
  type ExternalBrowserOpenDetail,
} from '@/lib/external_browser';
import { openCampaignHref, toInternalAppPath } from '@/lib/campaign_nav';
import { resolveInviteCampaignEnterUrl } from '@/lib/genesis50_auth';

type BrowserState = {
  open: boolean;
  url: string;
  title: string;
  loading: boolean;
  chrome: ExternalBrowserChrome;
  inviteCampaign: ExternalBrowserInviteCampaign | null;
  inviteForm: boolean;
};

const CLOSED: BrowserState = {
  open: false,
  url: '',
  title: '',
  loading: false,
  chrome: 'app',
  inviteCampaign: null,
  inviteForm: false,
};

/**
 * 真外链全屏内嵌浏览器：留在 PWA 壳内。
 * 若事件误带站内 URL，直接同窗跳转，不展示浏览器顶栏。
 * 默认 chrome=app：仅返回+标题；无网址 / 无「浏览器打开」。
 * 邀请码活动：壳内同源表单一次进入，避免 iframe 内外站登录要点两次。
 */
export default function ExternalBrowserSheet() {
  const [state, setState] = useState<BrowserState>(CLOSED);
  const [frameBlocked, setFrameBlocked] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<ExternalBrowserOpenDetail>).detail || {};
      const nextUrl = (detail.url || '').trim();

      // 站内链接不应进入内嵌浏览器（避免 PWA 套 PWA + 双层壳）
      if (nextUrl && toInternalAppPath(nextUrl)) {
        openCampaignHref(nextUrl);
        return;
      }

      setState((prev) => {
        const loading =
          typeof detail.loading === 'boolean'
            ? detail.loading
            : nextUrl
              ? false
              : prev.loading;
        const chrome =
          detail.chrome === 'browser'
            ? 'browser'
            : detail.chrome === 'app'
              ? 'app'
              : prev.open
                ? prev.chrome
                : 'app';
        const inviteCampaign =
          detail.inviteCampaign !== undefined
            ? detail.inviteCampaign || null
            : prev.open
              ? prev.inviteCampaign
              : null;
        const inviteForm =
          typeof detail.inviteForm === 'boolean'
            ? detail.inviteForm
            : nextUrl
              ? false
              : prev.inviteForm;
        return {
          open: true,
          url: nextUrl || (inviteForm ? '' : prev.url),
          title: (detail.title || '').trim() || prev.title || '网页',
          loading,
          chrome,
          inviteCampaign,
          inviteForm,
        };
      });
      if (detail.inviteCampaign?.code) {
        setInviteCode((c) => c || detail.inviteCampaign!.code || '');
      }
      if (nextUrl) {
        setFrameBlocked(false);
        setInviteError(null);
      }
      if (detail.inviteForm) setInviteError(null);
    };
    window.addEventListener(EXTERNAL_BROWSER_OPEN, onOpen);
    return () => window.removeEventListener(EXTERNAL_BROWSER_OPEN, onOpen);
  }, []);

  useEffect(() => {
    if (!state.open) return;
    document.documentElement.classList.add('external-browser-open');
    document.body.classList.add('external-browser-open');
    return () => {
      document.documentElement.classList.remove('external-browser-open');
      document.body.classList.remove('external-browser-open');
    };
  }, [state.open]);

  const close = useCallback(() => {
    setState(CLOSED);
    setFrameBlocked(false);
    setInviteBusy(false);
    setInviteError(null);
    setInviteCode('');
    try {
      document.documentElement.classList.remove('external-browser-open');
      document.body.classList.remove('external-browser-open');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.open, close]);

  useEffect(() => {
    if (!state.open) return;
    const onAway = () => close();
    window.addEventListener('presto-tab-nav', onAway);
    return () => window.removeEventListener('presto-tab-nav', onAway);
  }, [state.open, close]);

  const submitInvite = useCallback(async () => {
    const campaign = state.inviteCampaign;
    if (!campaign?.href) return;
    const code = inviteCode.trim().toUpperCase();
    if (!code) {
      setInviteError('请输入邀请码');
      return;
    }
    setInviteBusy(true);
    setInviteError(null);
    try {
      const url = await resolveInviteCampaignEnterUrl(campaign.href, code);
      setState((prev) => ({
        ...prev,
        url,
        loading: false,
        inviteForm: false,
      }));
      setFrameBlocked(false);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : '进入失败，请检查邀请码后重试');
    } finally {
      setInviteBusy(false);
    }
  }, [state.inviteCampaign, inviteCode]);

  if (!state.open) return null;

  const appChrome = state.chrome === 'app';
  const hostLabel = (() => {
    if (appChrome) return '';
    try {
      return state.url ? new URL(state.url).hostname.replace(/^www\./, '') : '';
    } catch {
      return '';
    }
  })();

  const showInvitePanel = Boolean(state.inviteForm || (!state.url && state.inviteCampaign));
  const canShowInviteToggle = Boolean(state.inviteCampaign && state.url && !showInvitePanel);

  return (
    <AppBodyPortal onTabAway={close}>
      <div
        className={`external-browser${appChrome ? ' external-browser--app' : ''}`}
        data-shell-touch-blocker
        role="dialog"
        aria-modal="true"
        aria-label={state.title}
      >
        <header className="external-browser-top">
          <button type="button" className="external-browser-close" onClick={close} aria-label="返回">
            返回
          </button>
          <div className="external-browser-title-wrap">
            <div className="external-browser-title">
              {state.title === hostLabel ? '网页' : state.title}
            </div>
            {hostLabel ? <div className="external-browser-host">{hostLabel}</div> : null}
          </div>
          {canShowInviteToggle ? (
            <button
              type="button"
              className="external-browser-system"
              onClick={() => {
                setInviteError(null);
                setState((prev) => ({ ...prev, inviteForm: true }));
              }}
            >
              邀请码
            </button>
          ) : appChrome ? (
            <span className="external-browser-top-spacer" aria-hidden />
          ) : (
            <button
              type="button"
              className="external-browser-system"
              disabled={!state.url || state.loading}
              onClick={() => state.url && openInSystemBrowser(state.url)}
            >
              浏览器打开
            </button>
          )}
        </header>

        <div className="external-browser-body">
          {state.loading || (!state.url && !showInvitePanel) ? (
            <div className="external-browser-loading" aria-live="polite">
              <span className="external-browser-spinner" aria-hidden />
              <p>正在打开…</p>
            </div>
          ) : state.url && !showInvitePanel ? (
            <iframe
              key={state.url}
              className="external-browser-frame"
              src={state.url}
              title={state.title}
              allow="fullscreen; clipboard-read; clipboard-write"
              referrerPolicy="strict-origin-when-cross-origin"
              onError={() => setFrameBlocked(true)}
            />
          ) : null}

          {showInvitePanel && state.inviteCampaign ? (
            <div className="external-browser-invite" aria-live="polite">
              <p className="external-browser-invite-title">邀请码进入</p>
              <p className="external-browser-invite-hint">
                在彼爱内验证，点一次即可进入活动（无需在活动页反复登录）
              </p>
              <input
                className="external-browser-invite-input"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="8 位邀请码"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={16}
                disabled={inviteBusy}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitInvite();
                }}
              />
              {inviteError ? (
                <p className="external-browser-invite-error">{inviteError}</p>
              ) : null}
              <button
                type="button"
                className="btn btn-primary external-browser-invite-submit"
                disabled={inviteBusy || !inviteCode.trim()}
                onClick={() => void submitInvite()}
              >
                {inviteBusy ? '进入中…' : '进入活动'}
              </button>
              {state.url ? (
                <button
                  type="button"
                  className="text-link external-browser-invite-back"
                  disabled={inviteBusy}
                  onClick={() => setState((prev) => ({ ...prev, inviteForm: false }))}
                >
                  返回活动页
                </button>
              ) : null}
            </div>
          ) : null}

          {frameBlocked && state.url && !showInvitePanel ? (
            <div className="external-browser-fallback">
              <p>此页面无法在应用内显示</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => openInSystemBrowser(state.url)}
              >
                用浏览器打开
              </button>
              <button type="button" className="text-link" onClick={close}>
                返回
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </AppBodyPortal>
  );
}
