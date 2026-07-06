'use client';

import Link from 'next/link';
import { useEffect, useState, type ComponentProps } from 'react';
import { assistantHref } from '@/lib/assistant_prefill';

type Props = Omit<ComponentProps<typeof Link>, 'href'> & {
  /** 可选：无 ref 时仅按问题进入小爱（如人生主题） */
  refParam?: string;
  excerpt?: string;
  question?: string;
  autoSend?: boolean;
  surface?: string;
};

/** 客户端挂载后再写入 sid，避免 SSR 链接缺少 seed */
export function AssistantLink({
  refParam,
  excerpt,
  question,
  autoSend,
  surface,
  ...linkProps
}: Props) {
  const [href, setHref] = useState(() => (
    refParam ? `/assistant?ref=${encodeURIComponent(refParam)}` : '/assistant'
  ));

  useEffect(() => {
    setHref(assistantHref(refParam, { excerpt, question, autoSend, surface }));
  }, [refParam, excerpt, question, autoSend, surface]);

  return <Link href={href} {...linkProps} />;
}
