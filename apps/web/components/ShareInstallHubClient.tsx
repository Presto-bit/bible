'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { openPwaInstallSheet } from '@/components/InstallPwaGuide';
import '@/styles/share_landings.css';
import { BRAND_NAME } from '@/lib/brand';
import {
  fetchAndroidPackageMeta,
  androidPackageDownloadHref,
} from '@/lib/app_package_settings';
import type { AndroidTwaMeta } from '@/lib/android_twa';
import { detectInstallPlatform, type InstallPlatform } from '@/lib/pwa_platform';
import {
  sanitizeShareInstallNext,
  SHARE_INSTALL_NEXT_PARAM,
} from '@/lib/share_install_hub';

type PlatformTab = 'ios' | 'android';

function formatPackageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DownloadIcon() {
  return (
    <svg
      className="share-start-v2-dl-icon"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M12 3v10m0 0l3.5-3.5M12 13l-3.5-3.5M5 19h14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 统一安装落地页（正式 / preview 共用） */
export function ShareInstallHubClient() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<PlatformTab>('ios');
  const [meta, setMeta] = useState<AndroidTwaMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);

  const continueHref = sanitizeShareInstallNext(
    searchParams.get(SHARE_INSTALL_NEXT_PARAM),
  );

  useEffect(() => {
    const p = detectInstallPlatform();
    setPlatform(p);
    if (p === 'android-chrome' || p === 'android-other') setTab('android');
    if (p === 'ios-safari' || p === 'ios-other') setTab('ios');
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchAndroidPackageMeta().then((m) => {
      if (!cancelled) {
        setMeta(m);
        setMetaLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const versionLabel = meta?.versionName ? `v${meta.versionName}` : null;
  const sizeLabel = meta ? formatPackageBytes(meta.bytes) : null;

  const startApkDownload = () => {
    if (platform === 'inapp') {
      openPwaInstallSheet();
      return;
    }
    window.location.href = androidPackageDownloadHref();
  };

  return (
    <div className="share-start-v2">
      <main className="share-start-v2-main">
        <header className="share-start-v2-hero">
          <div className="share-start-v2-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="share-start-v2-icon"
              src={meta?.icon192Url || meta?.iconUrl || '/apple-touch-icon.png'}
              alt=""
              width={56}
              height={56}
            />
            <div>
              <p className="share-start-v2-eyebrow">{BRAND_NAME}</p>
              <h1 className="share-start-v2-title">把彼爱装到手机桌面</h1>
            </div>
          </div>
          <p className="share-start-v2-lead">
            <strong>{BRAND_NAME}</strong>
            是陪你读经的 App：沉浸阅读与计划帮你坚持每天读；小爱帮你弄懂经文；发现里可以和好友共读打卡、收重要消息。账号与进度在
            iOS、安卓之间同步。
          </p>
        </header>

        <section className="share-start-v2-install" aria-label="安装方式">
          <div className="share-start-v2-seg" role="tablist" aria-label="安装方式">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'ios'}
              className={tab === 'ios' ? 'is-on' : ''}
              onClick={() => setTab('ios')}
            >
              iPhone / iPad
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'android'}
              className={tab === 'android' ? 'is-on' : ''}
              onClick={() => setTab('android')}
            >
              安卓/鸿蒙
            </button>
          </div>

          {tab === 'ios' ? (
            <div className="share-start-v2-panel" role="tabpanel">
              <p className="share-start-v2-panel-hint">
                iPhone、iPad 请用 <strong>Safari</strong> 添加主屏幕（微信里不能直接添加，需先跳到
                Safari）。
              </p>
              <ol className="invite-app-steps">
                <li className="invite-app-step">
                  <strong>从微信跳到 Safari</strong>
                  <span className="muted">点右上角 ··· → 选「在 Safari 打开」</span>
                </li>
                <li className="invite-app-step">
                  <strong>点 Safari 底部分享</strong>
                  <span className="muted">中间一排图标里，方框带向上箭头</span>
                </li>
                <li className="invite-app-step">
                  <strong>找到「添加到主屏幕」</strong>
                  <span className="muted">在分享菜单里向下滑，名称可保持「{BRAND_NAME}」</span>
                </li>
                <li className="invite-app-step">
                  <strong>点右上角「添加」</strong>
                  <span className="muted">回到手机桌面，点新图标打开（不是书签）</span>
                </li>
              </ol>
              <p className="share-start-v2-panel-foot muted">
                添加完成后从桌面打开，即可使用与 App 相近的全屏体验；通知与离线能力以当前 iOS
                限制为准。
              </p>
            </div>
          ) : (
            <div className="share-start-v2-panel" role="tabpanel">
              <p className="share-start-v2-panel-hint muted">
                微信内请先用浏览器打开本页，再点下方安装包下载。
              </p>
              <button
                type="button"
                className="share-start-v2-dl-card"
                disabled={metaLoading}
                onClick={() => startApkDownload()}
              >
                <span className="share-start-v2-dl-icon-wrap" aria-hidden>
                  <DownloadIcon />
                </span>
                <span className="share-start-v2-dl-text">
                  <span className="share-start-v2-dl-title">
                    {metaLoading ? '正在读取安装包…' : '下载彼爱安装包'}
                  </span>
                  <span className="share-start-v2-dl-meta muted">
                    {metaLoading
                      ? '请稍候'
                      : [versionLabel, sizeLabel].filter(Boolean).join(' · ') || '官网最新版'}
                  </span>
                </span>
                <span className="share-start-v2-dl-go" aria-hidden>
                  ›
                </span>
              </button>
              <p className="share-start-v2-apk-foot muted">
                支持可安装 Android 应用的<strong>鸿蒙</strong>机型；纯血鸿蒙 NEXT 若无法安装，见
                <a className="text-link" href="/help/product">
                  产品说明
                </a>
                。
              </p>
            </div>
          )}

          <ul className="share-start-v2-faq">
            <li>
              <span className="share-start-v2-faq-q">装好还会看到我刚点开的内容吗？</span>
              <span className="muted">会的。装完首次打开会回到那条分享。</span>
            </li>
            <li>
              <span className="share-start-v2-faq-q">不登录可以先看吗？</span>
              <span className="muted">可以读和浏览；共读、消息需要登录。</span>
            </li>
          </ul>

          <a className="text-link share-start-v2-more" href="/help/product">
            查看完整产品介绍
          </a>
        </section>
      </main>

      <footer className="share-start-v2-sticky">
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => (tab === 'android' ? startApkDownload() : openPwaInstallSheet())}
        >
          {tab === 'ios'
            ? '添加到主屏幕'
            : versionLabel
              ? `下载安装包 ${versionLabel}`
              : '下载安装包'}
        </button>
        {continueHref ? (
          <Link className="btn btn-ghost btn-block share-start-v2-skip" href={continueHref}>
            先不安装，继续看分享
          </Link>
        ) : (
          <Link className="btn btn-ghost btn-block share-start-v2-skip" href="/">
            先不安装，打开首页
          </Link>
        )}
      </footer>
    </div>
  );
}