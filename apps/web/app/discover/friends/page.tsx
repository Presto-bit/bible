'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** 好友列表已并入发现 Tab；旧路由重定向。 */
export default function FriendsListRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/discover?tab=friends');
  }, [router]);
  return (
    <main className="container">
      <p className="muted">正在打开好友…</p>
    </main>
  );
}
