'use client';

import Link from 'next/link';
import { useEffect, useState, type ComponentProps } from 'react';
import { assistantHref } from '@/lib/assistant_prefill';

type Props = Omit<ComponentProps<typeof Link>, 'href'> & {
  refParam: string;
  excerpt?: string;
  question?: string;
  autoSend?: boolean;
};

/** 客户端挂载后再写入 sid，避免 SSR 链接缺少 seed */
export function AssistantLink({
  refParam,
  excerpt,
  question,
  autoSend,
  ...linkProps
}: Props) {
  const [href, setHref] = useState(() => `/assistant?ref=${encodeURIComponent(refParam)}`);

  useEffect(() => {
    setHref(assistantHref(refParam, { excerpt, question, autoSend }));
  }, [refParam, excerpt, question, autoSend]);

  return <Link href={href} {...linkProps} />;
}
