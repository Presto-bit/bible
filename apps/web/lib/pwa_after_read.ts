/** 有效读经后：带经节上下文的一次安装引导 */

import { isStandalonePwa } from './platform';
import {
  isInstallPromptSuppressed,
  noteInstallPromptShown,
} from './pwa_install_prompt';

const AFTER_READ_KEY = 'presto_pwa_after_read_v1';
export const PWA_INSTALL_CONTEXT_KEY = 'presto_pwa_install_context';

export type PwaInstallContext = {
  resumeLabel?: string;
  source?: 'after_read' | 'manual' | 'share';
};

export function readPwaInstallContext(): PwaInstallContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PWA_INSTALL_CONTEXT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PwaInstallContext;
  } catch {
    return null;
  }
}

export function writePwaInstallContext(ctx: PwaInstallContext | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!ctx) sessionStorage.removeItem(PWA_INSTALL_CONTEXT_KEY);
    else sessionStorage.setItem(PWA_INSTALL_CONTEXT_KEY, JSON.stringify(ctx));
  } catch {
    /* ignore */
  }
}

function alreadyPromptedAfterRead(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(AFTER_READ_KEY) === '1';
  } catch {
    return true;
  }
}

function markPromptedAfterRead() {
  try {
    localStorage.setItem(AFTER_READ_KEY, '1');
  } catch {
    /* ignore */
  }
}

/**
 * 第一次有效章进度记入后：若未装 PWA 且未冷却，弹出「续读 · 卷章」安装引导（终身一次）。
 */
export function maybePromptInstallAfterRead(opts: {
  bookName: string;
  chapter: number;
}): void {
  if (typeof window === 'undefined') return;
  if (isStandalonePwa()) return;
  if (isInstallPromptSuppressed()) return;
  if (alreadyPromptedAfterRead()) return;

  const label = `${opts.bookName} ${opts.chapter}`.trim();
  writePwaInstallContext({
    resumeLabel: label,
    source: 'after_read',
  });
  markPromptedAfterRead();
  noteInstallPromptShown();

  void import('@/components/InstallPwaGuide').then((m) => {
    m.openPwaInstallSheet({ resumeLabel: label, source: 'after_read' });
  });
}
