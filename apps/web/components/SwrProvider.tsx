'use client';

/** 占位 Provider：首页等可用 useHomeBootstrap 内存去重；后续可换正式 SWR。 */
export function SwrProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
