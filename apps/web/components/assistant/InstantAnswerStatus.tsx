'use client';

import { instantAnswerLabel } from '@/lib/assistant_instant';

type Props = {
  instant?: boolean;
  cacheSource?: string;
  local?: boolean;
  className?: string;
};

/** 答案缓存 / 预读命中时的轻量状态行。 */
export function InstantAnswerStatus({
  instant,
  cacheSource,
  local,
  className,
}: Props) {
  if (!instant && !local) return null;
  return (
    <p
      className={['assistant-instant-status', 'muted', className].filter(Boolean).join(' ')}
      role="status"
    >
      {instantAnswerLabel({ cacheSource, local })}
    </p>
  );
}
