'use client';

import { useEffect, useRef } from 'react';
import { isPeiaiAndroidShell } from '@/lib/pwa_platform';

/** 相对键盘顶再上抬，确保能看见正在输入的文字 */
const LIFT_PX = 20;
/** 壳上系统栏/手势条抖动常见 <80；真键盘多 ≥120。门槛过高会误判「无键盘」→ 输入沉底被挡 */
const SHELL_GAP_FLOOR = 96;
const PWA_GAP_FLOOR = 40;
const LAYOUT_SHRINK_FLOOR = 40;

function pinDocScroll() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  const app = document.querySelector('.app-body');
  if (app instanceof HTMLElement) app.scrollTop = 0;
}

/** 底栏真正占位：视口底 → 浮动胶囊顶（含 float-gap），勿只用 pill 自身 height */
function readTabbarReservePx(): number {
  const layoutH = Math.round(window.innerHeight || 0);
  const el = document.querySelector('.tabbar');
  if (el instanceof HTMLElement && layoutH > 80) {
    const top = el.getBoundingClientRect().top;
    if (top > 40 && top < layoutH) {
      return Math.max(56, Math.round(layoutH - top));
    }
  }
  // fallback：解析 --tabbar-h（含 float-gap + safe）
  try {
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
      'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;height:var(--tabbar-h)';
    document.documentElement.appendChild(probe);
    const h = Math.round(probe.getBoundingClientRect().height);
    probe.remove();
    if (h > 40) return h;
  } catch {
    /* ignore */
  }
  return 84;
}

/** 输入区底边与浮动 Tab 顶之间的呼吸间距（再叠 composer padding） */
const TAB_BREATH_PX = 18;

function isComposerFieldFocused(): boolean {
  const ae = document.activeElement;
  if (!(ae instanceof HTMLElement)) return false;
  if (!ae.closest('.assistant-composer')) return false;
  return ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT';
}

/** 清掉小爱页高度 / 键盘相关 class 与 CSS 变量（离开 Tab 必调） */
export function clearAssistantViewportChrome() {
  if (typeof document === 'undefined') return;
  document.body.classList.remove(
    'assistant-active',
    'assistant-immersive',
    'assistant-tabbar-peek',
    'assistant-keyboard',
    'assistant-keyboard-vv',
  );
  const root = document.documentElement;
  root.style.removeProperty('--assistant-page-h');
  root.style.removeProperty('--assistant-overlay-h');
  root.style.removeProperty('--assistant-vv-h');
  root.style.removeProperty('--assistant-kb-inset');
}

/**
 * 小爱 Tab 视口：与 IM 同源策略。
 * - 空闲：--assistant-page-h = 稳定可视高 − 实测底栏（单真相源，避免 100dvh 双扣半屏）
 * - 聚焦：先藏底栏并铺满可视高；确认键盘后再锁 vv 高度
 * - 壳上提高 gap 门槛，防手势条误判成键盘
 */
export function useAssistantViewport(
  paneActive: boolean,
  composerFocused: boolean,
  setComposerFocused: (v: boolean) => void,
) {
  const baselineRef = useRef(0);
  const focusedRef = useRef(composerFocused);
  focusedRef.current = composerFocused;

  useEffect(() => {
    if (!paneActive) {
      focusedRef.current = false;
      setComposerFocused(false);
      clearAssistantViewportChrome();
      return;
    }
    // 同步挂上：延后时 .app-body 仍带 tabbar padding → TWA 首帧半屏
    document.body.classList.add('assistant-active');
    document.body.classList.remove('assistant-immersive', 'assistant-tabbar-peek');
    return () => {
      clearAssistantViewportChrome();
    };
  }, [paneActive, setComposerFocused]);

  useEffect(() => () => clearAssistantViewportChrome(), []);

  useEffect(() => {
    if (!paneActive) return;
    const root = document.documentElement;
    const body = document.body;
    const vv = window.visualViewport;
    let raf = 0;

    const writeIdleHeight = (shellH: number) => {
      const reserve = readTabbarReservePx();
      const pageH = Math.max(200, Math.round(shellH) - reserve - TAB_BREATH_PX);
      root.style.setProperty('--assistant-page-h', `${pageH}px`);
      root.style.setProperty('--assistant-overlay-h', `${Math.round(shellH)}px`);
      root.style.removeProperty('--assistant-vv-h');
      root.style.removeProperty('--assistant-kb-inset');
      body.classList.remove('assistant-keyboard', 'assistant-keyboard-vv');
    };

    const ensureComposerVisible = () => {
      const field = document.querySelector(
        '.assistant-composer textarea, .assistant-composer input',
      );
      if (!(field instanceof HTMLElement)) return;
      try {
        field.scrollIntoView({ block: 'end', inline: 'nearest' });
      } catch {
        try {
          field.scrollIntoView(false);
        } catch {
          /* ignore */
        }
      }
    };

    const writeKeyboardHeight = (pageH: number, withVvLock: boolean) => {
      const h = Math.max(160, Math.round(pageH));
      root.style.setProperty('--assistant-page-h', `${h}px`);
      // 历史抽屉等全屏层：始终用稳定壳高，勿跟键盘矮窗走，避免「点了没弹层」
      root.style.setProperty(
        '--assistant-overlay-h',
        `${Math.max(h, baselineRef.current || h, Math.round(window.innerHeight || h))}px`,
      );
      body.classList.add('assistant-keyboard');
      if (withVvLock) {
        root.style.setProperty('--assistant-vv-h', `${h}px`);
        body.classList.add('assistant-keyboard-vv');
        // 高度已按 vv 收过；底距只留少量，避免双扣把输入再顶出视口
        root.style.setProperty('--assistant-kb-inset', '10px');
        ensureComposerVisible();
      } else {
        root.style.removeProperty('--assistant-vv-h');
        body.classList.remove('assistant-keyboard-vv');
        // 底栏已藏：勿再留 tabbar 空洞；轻底距即可
        root.style.setProperty('--assistant-kb-inset', '8px');
      }
    };

    const syncViewport = () => {
      const layoutH = Math.round(window.innerHeight || root.clientHeight || 0);
      const vvH = Math.round(vv?.height ?? layoutH);
      const vvTop = Math.max(0, Math.round(vv?.offsetTop ?? 0));
      const vvBottom = vvH + vvTop;
      const focused = focusedRef.current && isComposerFieldFocused();

      if (!focused) {
        baselineRef.current = Math.max(layoutH, vvBottom);
        const shellH =
          layoutH > 0 && baselineRef.current - layoutH < 80
            ? layoutH
            : Math.max(layoutH, vvH);
        writeIdleHeight(shellH > 0 ? shellH : Math.max(layoutH, vvH));
        return;
      }

      pinDocScroll();
      const base = baselineRef.current || Math.max(layoutH, vvBottom);
      const layoutShrunk = base - layoutH > LAYOUT_SHRINK_FLOOR;
      const gap = Math.max(0, base - vvBottom, base - vvH);
      const gapFloor = isPeiaiAndroidShell() ? SHELL_GAP_FLOOR : PWA_GAP_FLOOR;
      const keyboardUp = layoutShrunk || gap > gapFloor;

      if (keyboardUp) {
        // 底栏已藏：勿再扣 tabbar。layout 已收缩跟 layout，否则跟 vv
        const pageH = layoutShrunk
          ? Math.max(160, layoutH - LIFT_PX)
          : Math.max(160, vvH - LIFT_PX);
        writeKeyboardHeight(pageH, true);
        return;
      }

      // 已聚焦、键盘尚未确认：藏底栏并铺满当前壳高（消除「扣了 tabbar 却藏栏」的悬空带）
      const shellH = layoutH > 0 ? layoutH : Math.max(120, vvH);
      writeKeyboardHeight(shellH - 8, false);
    };

    const onViewport = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(syncViewport);
    };

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (!t.closest('.assistant-composer')) return;
      if (t.tagName !== 'TEXTAREA' && t.tagName !== 'INPUT') return;
      focusedRef.current = true;
      setComposerFocused(true);
      pinDocScroll();
      syncViewport();
    };

    const onFocusOut = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLElement) || !t.closest('.assistant-composer')) return;
      const next = e.relatedTarget;
      if (next instanceof HTMLElement && next.closest('.assistant-composer')) return;
      focusedRef.current = false;
      setComposerFocused(false);
      syncViewport();
    };

    const onWindowScroll = () => {
      if (focusedRef.current) pinDocScroll();
    };

    syncViewport();
    const t = window.setTimeout(syncViewport, 120);
    vv?.addEventListener('resize', onViewport);
    vv?.addEventListener('scroll', onViewport);
    window.addEventListener('resize', onViewport);
    window.addEventListener('orientationchange', onViewport);
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('focusout', onFocusOut);
    window.addEventListener('scroll', onWindowScroll, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      vv?.removeEventListener('resize', onViewport);
      vv?.removeEventListener('scroll', onViewport);
      window.removeEventListener('resize', onViewport);
      window.removeEventListener('orientationchange', onViewport);
      window.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('scroll', onWindowScroll);
    };
  }, [paneActive, setComposerFocused]);
}
