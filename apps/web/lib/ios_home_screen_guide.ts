/**
 * Safari「添加到主屏幕」入口随系统变，不能写死一条。
 *
 * - iOS 18 及更早：底部工具栏中间就是「共享」，点开后直接有「添加到主屏幕」。
 * - iOS 26 默认「紧凑」标签栏：右侧 ··· → 共享 → 查看更多 → 添加到主屏幕。
 *   用户若在「设置 → App → Safari → 标签页」改成底部/顶部，共享会回到底部中间（读不到这项设置，用一句备用说明）。
 * - iOS 27 紧凑栏：右侧不再是 ···（改成了标签页按钮），共享在网址左侧的菜单里。
 * - 横屏、iPad：共享在右上角。iPad 机型不在 UA 里，只能靠 iPad / 桌面版 UA 判断。
 */

import { useEffect, useState } from 'react';

export type IosA2hsAnchor = 'bottom-right' | 'bottom-center' | 'bottom-left' | 'top-right';

export type IosA2hsMark = 'more' | 'share' | 'menu';

export interface IosA2hsStep {
  title: string;
  detail: string;
}

export interface IosAddToHomeGuide {
  id: 'ios26-compact' | 'ios27-page-menu' | 'legacy-center' | 'corner-share' | 'corner-share-more';
  anchor: IosA2hsAnchor;
  mark: IosA2hsMark;
  steps: readonly IosA2hsStep[];
  hint: string;
  /** 同一系统里另一种标签栏布局，读不到设置时的备用一句 */
  alternate: string | null;
  summary: string;
}

export interface IosGuideEnv {
  ua: string;
  platform?: string;
  maxTouchPoints?: number;
  landscape?: boolean;
}

const ADD_STEP: IosA2hsStep = {
  title: '点「添加到主屏幕」',
  detail: '再点右上角「添加」，名称是「彼爱」',
};

const MORE_STEP: IosA2hsStep = {
  title: '点「查看更多」',
  detail: '接着往下找',
};

const HINT_ADD = '按顺序点。最后再点右上角「添加」。';

const ALT_CENTER_SHARE = '若底部中间已经有「共享」，直接点它，再点「查看更多」。';

const GUIDE_IOS26: IosAddToHomeGuide = {
  id: 'ios26-compact',
  anchor: 'bottom-right',
  mark: 'more',
  steps: [
    { title: '点右侧 ···', detail: 'Safari 底部栏右侧' },
    { title: '点「共享」', detail: '在刚打开的菜单里' },
    MORE_STEP,
    ADD_STEP,
  ],
  hint: HINT_ADD,
  alternate: ALT_CENTER_SHARE,
  summary: '右侧 ··· → 共享 → 查看更多 → 添加到主屏幕',
};

const GUIDE_IOS27: IosAddToHomeGuide = {
  id: 'ios27-page-menu',
  anchor: 'bottom-left',
  mark: 'menu',
  steps: [
    { title: '点网址左侧图标', detail: '底部地址栏里，紧挨网址的左边，不是返回' },
    { title: '点「共享」', detail: '在刚打开的菜单里' },
    MORE_STEP,
    ADD_STEP,
  ],
  hint: '左侧图标紧挨网址，不是返回。最后再点右上角「添加」。',
  alternate: ALT_CENTER_SHARE,
  summary: '网址左侧图标 → 共享 → 查看更多 → 添加到主屏幕',
};

const GUIDE_LEGACY: IosAddToHomeGuide = {
  id: 'legacy-center',
  anchor: 'bottom-center',
  mark: 'share',
  steps: [
    { title: '点底部中间「共享」', detail: '方框向上的箭头；若只看见网址，先点一下底部地址栏' },
    ADD_STEP,
  ],
  hint: '按顺序点。若底部只剩网址，先点一下地址栏。最后再点右上角「添加」。',
  alternate: null,
  summary: '底部中间「共享」→ 添加到主屏幕',
};

const GUIDE_CORNER: IosAddToHomeGuide = {
  id: 'corner-share',
  anchor: 'top-right',
  mark: 'share',
  steps: [
    { title: '点右上角「共享」', detail: '屏幕右上角' },
    ADD_STEP,
  ],
  hint: HINT_ADD,
  alternate: null,
  summary: '右上角「共享」→ 添加到主屏幕',
};

const GUIDE_CORNER_MORE: IosAddToHomeGuide = {
  id: 'corner-share-more',
  anchor: 'top-right',
  mark: 'share',
  steps: [
    { title: '点右上角「共享」', detail: '屏幕右上角' },
    MORE_STEP,
    ADD_STEP,
  ],
  hint: HINT_ADD,
  alternate: '若右上角没有「共享」，点地址栏旁边的菜单，再点「共享」。',
  summary: '右上角「共享」→ 查看更多 → 添加到主屏幕',
};

/** 认不出版本时沿用现在的 iOS 26 紧凑路径，避免把未知环境改成没验证过的步骤。 */
export const IOS_ADD_TO_HOME_FALLBACK = GUIDE_IOS26;

export function appleOsMajorFromUa(ua: string): number | null {
  if (/iPhone|iPad|iPod/.test(ua)) {
    const mobile = ua.match(/OS (\d+)[_.]/);
    if (mobile) return Number(mobile[1]);
  }
  const version = ua.match(/Version\/(\d+)\./);
  if (version) return Number(version[1]);
  return null;
}

export function isIpadLike(env: IosGuideEnv): boolean {
  if (/iPad/.test(env.ua)) return true;
  return env.platform === 'MacIntel' && (env.maxTouchPoints ?? 0) > 1;
}

export function resolveIosAddToHomeGuide(env: IosGuideEnv): IosAddToHomeGuide {
  const major = appleOsMajorFromUa(env.ua);
  const needsMore = major != null && major >= 26;
  if (isIpadLike(env)) return needsMore ? GUIDE_CORNER_MORE : GUIDE_CORNER;
  if (env.landscape) return needsMore ? GUIDE_CORNER_MORE : GUIDE_CORNER;
  if (major != null && major >= 27) return GUIDE_IOS27;
  if (major != null && major >= 26) return GUIDE_IOS26;
  if (major == null) return IOS_ADD_TO_HOME_FALLBACK;
  return GUIDE_LEGACY;
}

export function readIosGuideEnv(): IosGuideEnv {
  if (typeof navigator === 'undefined') return { ua: '', landscape: false };
  const landscape = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(orientation: landscape)').matches;
  return {
    ua: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    landscape,
  };
}

export function currentIosAddToHomeGuide(): IosAddToHomeGuide {
  return resolveIosAddToHomeGuide(readIosGuideEnv());
}

/** 跟随横竖屏切换步骤。首帧用 iOS 26 紧凑路径，避免服务端和浏览器首屏不一致。 */
export function useIosAddToHomeGuide(): IosAddToHomeGuide {
  const [guide, setGuide] = useState(() =>
    typeof window === 'undefined' ? IOS_ADD_TO_HOME_FALLBACK : currentIosAddToHomeGuide(),
  );
  useEffect(() => {
    const update = () => setGuide(currentIosAddToHomeGuide());
    update();
    const mq = window.matchMedia('(orientation: landscape)');
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return guide;
}
