'use client';

import { useEffect, useRef } from 'react';
import { isPeiaiAndroidShell } from '@/lib/pwa_platform';

/**
 * 与 IM（use_im_composer_keyboard）同源：
 * - 空闲：page-h = layout − 底栏占位 − 呼吸（保证输入在浮动 Tab 上方）
 * - 聚焦：立刻进 vv-shell（藏底栏），page-h 跟 layout 收缩或 visualViewport
 * - 高度写入去抖；勿在 sync 里 scrollIntoView，避免键盘动画期横跳/抖动
 */
const GAP_FLOOR = 40;
const LAYOUT_SHRINK_FLOOR = 40;
/** 键盘确认后输入底与键盘顶的呼吸 */
const KB_PAD_PX = 10;
/** 输入区底边与浮动 Tab 顶之间的呼吸（空闲态；有对话时需够躲开胶囊） */
const TAB_BREATH_PX = 40;
/** 高度变化小于此值不写 CSS，减少 reflow 抖动 */
const HEIGHT_EPSILON_PX = 2;

function pinDocScroll() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  const app = document.querySelector('.app-body');
  if (app instanceof HTMLElement) app.scrollTop = 0;
}

/** 底栏真正占位：视口底 → 浮动胶囊顶（含 float-gap） */
function readTabbarReservePx(): number {
  const layoutH = Math.round(window.innerHeight || 0);
  const el = document.querySelector('.tabbar');
  if (el instanceof HTMLElement && layoutH > 80) {
    const top = el.getBoundingClientRect().top;
    if (top > 40 && top < layoutH) {
      return Math.max(64, Math.round(layoutH - top));
    }
  }
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
  return 96;
}

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
  root.style.removeProperty('--assistant-vv-top');
  root.style.removeProperty('--assistant-kb-inset');
}

/**
 * 小爱 Tab 视口：对齐 IM 壳策略，保证键盘上时输入贴在键盘顶上方。
 */
export function useAssistantViewport(
  paneActive: boolean,
  composerFocused: boolean,
  setComposerFocused: (v: boolean) => void,
) {
  const baselineRef = useRef(0);
  const lastIdleHRef = useRef(-1);
  const lastKbHRef = useRef(-1);
  const focusedRef = useRef(composerFocused);
  focusedRef.current = composerFocused;

  useEffect(() => {
    if (!paneActive) {
      focusedRef.current = false;
      setComposerFocused(false);
      clearAssistantViewportChrome();
      return;
    }
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
      if (Math.abs(pageH - lastIdleHRef.current) < HEIGHT_EPSILON_PX) {
        body.classList.remove('assistant-keyboard', 'assistant-keyboard-vv');
        root.style.removeProperty('--assistant-vv-h');
        root.style.removeProperty('--assistant-vv-top');
        root.style.removeProperty('--assistant-kb-inset');
        return;
      }
      lastIdleHRef.current = pageH;
      lastKbHRef.current = -1;
      root.style.setProperty('--assistant-page-h', `${pageH}px`);
      root.style.setProperty('--assistant-overlay-h', `${Math.round(shellH)}px`);
      root.style.removeProperty('--assistant-vv-h');
      root.style.removeProperty('--assistant-vv-top');
      root.style.removeProperty('--assistant-kb-inset');
      body.classList.remove('assistant-keyboard', 'assistant-keyboard-vv');
    };

    const writeKeyboardHeight = (pageH: number) => {
      const h = Math.max(160, Math.round(pageH));
      body.classList.add('assistant-keyboard', 'assistant-keyboard-vv');
      if (Math.abs(h - lastKbHRef.current) < HEIGHT_EPSILON_PX) return;
      lastKbHRef.current = h;
      lastIdleHRef.current = -1;
      root.style.setProperty('--assistant-page-h', `${h}px`);
      root.style.setProperty(
        '--assistant-overlay-h',
        `${Math.max(h, baselineRef.current || h, Math.round(window.innerHeight || h))}px`,
      );
      // top 固定 0：跟 IM 一样，避免 offsetTop 把壳顶飞造成横跳
      root.style.setProperty('--assistant-vv-h', `${h}px`);
      root.style.setProperty('--assistant-vv-top', '0px');
      root.style.setProperty('--assistant-kb-inset', `${KB_PAD_PX}px`);
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
      const vvOccluded = base - vvBottom > GAP_FLOOR || base - vvH > GAP_FLOOR;
      const keyboardUp = layoutShrunk || vvOccluded;

      // layout 已收缩跟 layout；卡住则跟 vv（勿再减 LIFT、勿跟 offsetTop）
      const pageH = keyboardUp
        ? layoutShrunk
          ? Math.max(160, layoutH)
          : Math.max(160, vvH)
        : Math.max(160, layoutH > 0 ? layoutH : vvH);
      writeKeyboardHeight(pageH);

      if (!keyboardUp && isPeiaiAndroidShell()) {
        window.setTimeout(() => {
          if (focusedRef.current) syncViewport();
        }, 280);
      }
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
      // 键盘动画中途再同步一次即可，过多会抖
      window.setTimeout(syncViewport, 180);
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
    // 不跟 vv scroll：iOS 键盘动画期 offsetTop 抖动，易造成横跳
    window.addEventListener('resize', onViewport);
    window.addEventListener('orientationchange', onViewport);
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('focusout', onFocusOut);
    window.addEventListener('scroll', onWindowScroll, { passive: true });

    let ro: ResizeObserver | null = null;
    const tab = document.querySelector('.tabbar');
    if (tab && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onViewport);
      ro.observe(tab);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      ro?.disconnect();
      vv?.removeEventListener('resize', onViewport);
      window.removeEventListener('resize', onViewport);
      window.removeEventListener('orientationchange', onViewport);
      window.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('scroll', onWindowScroll);
    };
  }, [paneActive, setComposerFocused]);
}
