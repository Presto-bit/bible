'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** 好友列表已并入通讯录；旧路由重定向。 */
export default function FriendsListRedirectPage() {
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
