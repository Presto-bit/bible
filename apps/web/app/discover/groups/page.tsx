'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** 共读群已并入通讯录二级页；旧路由重定向。 */
export default function GroupsListRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/discover/contacts/groups');
  }, [router]);
  return (
    <main className="container">
      <p className="muted">正在打开通讯录…</p>
    </main>
  );
}
