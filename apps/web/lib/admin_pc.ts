'use client';

import { useEffect, useState } from 'react';

/** PC 管理台断点：与 CSS `@media (min-width: 1100px)` 对齐 */
export const ADMIN_PC_MQ = '(min-width: 1100px)';

export function useAdminPc(): boolean {
  const [pc, setPc] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(ADMIN_PC_MQ);
    const apply = () => setPc(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return pc;
}
