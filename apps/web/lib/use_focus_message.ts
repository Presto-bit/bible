import { useEffect } from 'react';
import { focusMessageById } from '@/lib/im_ui';

/** 搜索/推送落地后滚到消息并短暂高亮。 */
export function useFocusMessage(focusMsg: string | null | undefined) {
  useEffect(() => {
    if (!focusMsg || focusMsg.startsWith('title:')) return;
    const t = window.setTimeout(() => focusMessageById(focusMsg), 280);
    return () => window.clearTimeout(t);
  }, [focusMsg]);
}
