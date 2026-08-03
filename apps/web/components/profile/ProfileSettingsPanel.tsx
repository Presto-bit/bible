'use client';

/**
 * 「设置」主体（独立页使用）。
 * 不用半屏 portal —— 安卓壳上固定/层级叠层易导致「点了没反应」。
 */

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  api,
  currentUserId,
  ensureAccountReady,
  logout,
} from '@/lib/api';
import { OFFICIAL_SUPPORT_USER_CODE } from '@/lib/official_support';
import {
  getOfflineDownloadSnapshot,
  isOfflineDownloadActive,
  offlineDownloadLabel,
  subscribeOfflineDownload,
} from '@/lib/offline_download_job';
import { clearAppCacheAndReload } from '@/lib/clear_app_cache';
import { markRouteNavigation, navigateAppHref } from '@/lib/pwa_tab_nav';
import {
  androidPackageDownloadHref,
  fetchAndroidPackageMeta,
  resolveAppPackageRow,
  type AppPackageRow,
} from '@/lib/app_package_settings';
import { markAndroidTwaInstallClaimed } from '@/lib/pwa_install_prompt';
import { openPwaInstallSheet } from '@/components/InstallPwaGuide';
import { fetchAdminEligible } from '@/lib/admin_rag';
import {
  canCloudSync,
} from '@/lib/account_guide';
import { getSyncState, subscribeSyncState, syncStateLabel } from '@/lib/sync_status';
import { isSyncRequiresPasswordError, syncNow } from '@/lib/sync';
import { subscribeLocalDataChanged } from '@/lib/local_data_events';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';

const AccountSettingsSection = dynamic(() => import('@/components/AccountSettingsSection'), {
  ssr: false,
});
const OfflineDownloadSheet = dynamic(() => import('@/components/OfflineDownloadSheet'), {
  ssr: false,
});

function SettingsNavRow({
  title,
  hint,
  href,
  onClick,
  disabled,
  glyph,
  danger,
}: {
  title: string;
  hint?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  glyph?: ReactNode;
  danger?: boolean;
}) {
  const className = `settings-nav-row${danger ? ' is-danger' : ''}${disabled ? ' is-disabled' : ''}`;
  const body = (
    <>
      {glyph ? (
        <span className="settings-nav-glyph" aria-hidden>
          {glyph}
        </span>
      ) : null}
      <span className="settings-nav-main">
        <strong>{title}</strong>
        {hint ? <span className="muted">{hint}</span> : null}
      </span>
      <span className="muted settings-nav-chevron" aria-hidden>
        ›
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className} onClick={onClick}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" className={className} disabled={disabled} onClick={onClick}>
      {body}
    </button>
  );
}

function settingsGlyph(path: ReactNode) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {path}
    </svg>
  );
}

export default function ProfileSettingsPanel() {
  const confirm = useConfirm();
  const toast = useToast();
  const router = useRouter();

  const [uid, setUid] = useState<string | null>(() =>
    typeof window !== 'undefined' ? currentUserId() : null,
  );
  const [helpBusy, setHelpBusy] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadHint, setDownloadHint] = useState<string | null>(null);
  const [clearCacheBusy, setClearCacheBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncLabel, setSyncLabel] = useState(() =>
    typeof window !== 'undefined' ? syncStateLabel(getSyncState()) : '已同步到云端',
  );
  const [adminEligible, setAdminEligible] = useState(false);
  const [packageRow, setPackageRow] = useState<AppPackageRow>(() =>
    typeof window !== 'undefined'
      ? resolveAppPackageRow()
      : { title: '彼爱安装包', hint: '官网安装包', action: 'install_sheet' },
  );
  const [packageBusy, setPackageBusy] = useState(false);

  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';

  const markSettingsNav = () => {
    markRouteNavigation();
  };

  const refreshAccount = () => {
    setUid(currentUserId());
    setSyncLabel(canCloudSync() ? syncStateLabel(getSyncState()) : '需先设置密码');
  };

  useEffect(() => {
    void ensureAccountReady()
      .then(() => {
        setUid(currentUserId());
        setSyncLabel(canCloudSync() ? syncStateLabel(getSyncState()) : '需先设置密码');
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const refreshHint = () => {
      if (!isOfflineDownloadActive()) setDownloadHint(null);
      else setDownloadHint(offlineDownloadLabel(getOfflineDownloadSnapshot()));
    };
    refreshHint();
    return subscribeOfflineDownload(refreshHint);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchAdminEligible().then((ok) => {
      if (!cancelled) setAdminEligible(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    let cancelled = false;
    setPackageRow(resolveAppPackageRow());
    void (async () => {
      const meta = await fetchAndroidPackageMeta();
      let shellVersion: string | null | undefined;
      let shellVersionCode: number | null | undefined;
      try {
        const { readAndroidShellVersion } = await import('@/lib/android_shell_bridge');
        const local = readAndroidShellVersion();
        shellVersion = local.versionName;
        shellVersionCode = local.versionCode;
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      setPackageRow(
        resolveAppPackageRow({
          meta,
          shellVersion,
          shellVersionCode,
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const refreshSync = () => {
      setSyncLabel(canCloudSync() ? syncStateLabel(getSyncState()) : '需先设置密码');
    };
    const unsubSync = subscribeSyncState(refreshSync);
    const unsubData = subscribeLocalDataChanged(() => {
      setUid(currentUserId());
      refreshSync();
    });
    return () => {
      unsubSync();
      unsubData();
    };
  }, []);

  const openHelpFeedback = async () => {
    if (helpBusy) return;
    setHelpBusy(true);
    try {
      await ensureAccountReady();
      const dm = await api.openDm(OFFICIAL_SUPPORT_USER_CODE);
      markRouteNavigation();
      router.push(`/discover/dm/${dm.thread_id}`);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      toast(detail.includes('自己') ? '不能联系自己' : detail || '暂时无法联系官方，请稍后重试');
    } finally {
      setHelpBusy(false);
    }
  };

  const handleAppPackageClick = () => {
    if (packageBusy || packageRow.action === 'noop') return;
    if (packageRow.action === 'download_apk') {
      setPackageBusy(true);
      try {
        const inShell = /PeiaiAndroidShell\//i.test(navigator.userAgent);
        if (inShell) markAndroidTwaInstallClaimed();
        toast(
          inShell
            ? (packageRow.updateAvailable ? '正在下载更新包…' : '正在下载安装包…')
            : '开始下载安装包…装好后请打开桌面「彼爱」',
        );
        window.location.href = androidPackageDownloadHref();
      } finally {
        setPackageBusy(false);
      }
      return;
    }
    setPackageBusy(false);
    openPwaInstallSheet();
  };

  const handleClearCache = async () => {
    if (clearCacheBusy) return;
    const ok = await confirm({
      title: '清除缓存',
      message: '将清除页面与离线缓存并刷新应用，不会删除你的读经记录、笔记与账号登录状态。',
      confirmLabel: '清除并刷新',
    });
    if (!ok) return;
    setClearCacheBusy(true);
    try {
      await clearAppCacheAndReload();
    } catch {
      setClearCacheBusy(false);
      toast('清除失败，请尝试在浏览器设置中清除站点数据后重开');
    }
  };

  const handleSyncNow = async () => {
    if (syncBusy) return;
    if (!canCloudSync()) {
      toast('请先设置密码，设置后才会云同步');
      return;
    }
    setSyncBusy(true);
    try {
      await syncNow();
      setSyncLabel(syncStateLabel(getSyncState()));
      toast('已同步');
    } catch (e) {
      if (isSyncRequiresPasswordError(e)) {
        toast('请先设置密码，设置后才会云同步');
      } else {
        toast('同步失败，请检查网络后重试');
      }
    } finally {
      setSyncBusy(false);
      setSyncLabel(canCloudSync() ? syncStateLabel(getSyncState()) : '需先设置密码');
    }
  };

  return (
    <>
      <section className="settings-group">
        <h4 className="settings-group-label">账号与安全</h4>
        <div className="settings-group-list">
          <AccountSettingsSection collapsible onAccountChange={refreshAccount} />
          <SettingsNavRow
            title="在其他设备恢复"
            hint="登录或恢复账号"
            href="/login"
            glyph={settingsGlyph(
              <>
                <rect x="5" y="2" width="14" height="20" rx="2" />
                <path d="M12 17h.01" />
              </>,
            )}
          />
        </div>
      </section>

      <section className="settings-group">
        <h4 className="settings-group-label">读经与体验</h4>
        <div className="settings-group-list">
          <SettingsNavRow
            title="外观"
            hint="主题与阅读器"
            href="/profile/appearance"
            onClick={markSettingsNav}
            glyph={settingsGlyph(
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
              </>,
            )}
          />
          <SettingsNavRow
            title="提醒与勿扰"
            hint="读经提醒 · 圣经勿扰"
            href="/profile/reminders"
            onClick={markSettingsNav}
            glyph={settingsGlyph(
              <>
                <path d="M6 16h12l-1.2-1.2A6 6 0 0 1 15 10V9a3 3 0 1 0-6 0v1a6 6 0 0 1-1.8 4.8L6 16Z" />
                <path d="M10 19a2 2 0 0 0 4 0" />
              </>,
            )}
          />
          <SettingsNavRow
            title="离线下载"
            hint={downloadHint || '圣经与资料'}
            onClick={() => setDownloadOpen(true)}
            glyph={settingsGlyph(
              <>
                <path d="M12 4v10" />
                <path d="m8 10 4 4 4-4" />
                <path d="M5 18h14" />
              </>,
            )}
          />
          <SettingsNavRow
            title="知识库"
            hint="知识库与专题"
            href="/knowledge-bases"
            onClick={markSettingsNav}
            glyph={settingsGlyph(
              <>
                <path d="M4 19.5V6.5A2.5 2.5 0 0 1 6.5 4H20v15.5" />
                <path d="M6.5 19.5A2.5 2.5 0 0 0 9 17h11" />
              </>,
            )}
          />
        </div>
      </section>

      <section className="settings-group">
        <h4 className="settings-group-label">支持与关于</h4>
        <div className="settings-group-list">
          <SettingsNavRow
            title="帮助与反馈"
            hint={helpBusy ? '打开中…' : '帮助与反馈'}
            disabled={helpBusy}
            onClick={() => void openHelpFeedback()}
            glyph={settingsGlyph(
              <>
                <circle cx="12" cy="12" r="9" />
                <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4" />
                <path d="M12 17h.01" />
              </>,
            )}
          />
          <SettingsNavRow
            title="数据来源与许可"
            href="/profile/licenses"
            onClick={markSettingsNav}
            glyph={settingsGlyph(
              <>
                <path d="M7 4h10v16H7z" />
                <path d="M10 8h4M10 12h4M10 16h3" />
              </>,
            )}
          />
          <SettingsNavRow
            title={packageBusy ? '准备下载…' : packageRow.title}
            hint={packageRow.hint}
            disabled={packageBusy || packageRow.action === 'noop'}
            onClick={handleAppPackageClick}
            glyph={settingsGlyph(
              packageRow.updateAvailable ? (
                <>
                  <path d="M12 3v12" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M5 19h14" />
                </>
              ) : (
                <>
                  <rect x="6" y="3" width="12" height="18" rx="2" />
                  <path d="M12 17h.01" />
                </>
              ),
            )}
          />
          <div className="settings-version-row">
            <span className="muted">版本 {appVersion}</span>
            {adminEligible ? (
              <Link
                href="/admin?tab=ops"
                className="text-link settings-admin-link"
                onClick={markSettingsNav}
              >
                管理后台
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="settings-group settings-group-danger">
        <h4 className="settings-group-label">数据</h4>
        <div className="settings-group-list">
          <button
            type="button"
            className="settings-nav-row"
            disabled={syncBusy}
            onClick={() => void handleSyncNow()}
          >
            <span className="settings-nav-glyph" aria-hidden>
              {settingsGlyph(
                <>
                  <path d="M21 12a9 9 0 1 1-2.6-6.3" />
                  <path d="M21 3v6h-6" />
                </>,
              )}
            </span>
            <span className="settings-nav-main">
              <strong>{syncBusy ? '同步中…' : '同步到云端'}</strong>
              <span className="muted">{syncLabel}</span>
            </span>
          </button>
          <button
            type="button"
            className="settings-nav-row"
            disabled={clearCacheBusy}
            onClick={() => void handleClearCache()}
          >
            <span className="settings-nav-glyph" aria-hidden>
              {settingsGlyph(
                <>
                  <path d="M4 7h16" />
                  <path d="M9 7V5h6v2" />
                  <path d="M8 7l1 12h6l1-12" />
                </>,
              )}
            </span>
            <span className="settings-nav-main">
              <strong>{clearCacheBusy ? '清除中…' : '清除缓存'}</strong>
              <span className="muted">不删除读经记录</span>
            </span>
          </button>
          {uid ? (
            <button
              type="button"
              className="settings-nav-row is-danger"
              onClick={() => {
                logout();
                setUid(null);
                navigateAppHref('/profile', router);
              }}
            >
              <span className="settings-nav-glyph" aria-hidden>
                {settingsGlyph(
                  <>
                    <path d="M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2" />
                    <path d="M15 12H3m0 0 3-3m-3 3 3 3" />
                  </>,
                )}
              </span>
              <span className="settings-nav-main">
                <strong>退出登录</strong>
              </span>
            </button>
          ) : null}
        </div>
      </section>

      {downloadOpen ? <OfflineDownloadSheet onClose={() => setDownloadOpen(false)} /> : null}
    </>
  );
}
