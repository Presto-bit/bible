'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** 共读群已并入消息列表；旧「管理共读群」路由重定向。 */
export default function GroupsListRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/discover/contacts');
  }, [router]);
  return (
    <main className="container">
      <p className="muted">正在打开通讯录…</p>
    </main>
  );
}
