'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { assistantHref } from '@/lib/assistant_prefill';
import type { ComponentProps, MouseEvent } from 'react';

type Props = Omit<ComponentProps<typeof Link>, 'href'> & {
  /** 可选：无 ref 时仅按问题进入小爱（如人生主题） */
  refParam?: string;
  excerpt?: string;
  question?: string;
  autoSend?: boolean;
  surface?: string;
};

/** 点击时同步写入 sid 再跳转，避免首屏 href 尚未带 seed 时误恢复旧草稿。 */
export function AssistantLink({
  refParam,
  excerpt,
  question,
  autoSend,
  surface,
  onClick,
  ...linkProps
}: Props) {
  const router = useRouter();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    router.push(
      assistantHref(refParam, { excerpt, question, autoSend, surface }),
    );
  };

  return <Link href="/assistant" onClick={handleClick} {...linkProps} />;
}
