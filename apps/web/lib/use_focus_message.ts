import { useEffect } from 'react';
import { focusMessageById } from '@/lib/im_ui';

type FocusOpts = {
  /**
   * 消息不在 DOM 时调用：加载更早历史。
   * 返回 true 表示还有更多可加载；false 表示已到底。
   */
  loadOlder?: () => Promise<boolean>;
};

/** 搜索/推送落地后滚到消息并短暂高亮；必要时自动翻页加载。 */
export function useFocusMessage(
  focusMsg: string | null | undefined,
  opts?: FocusOpts,
) {
  const loadOlder = opts?.loadOlder;

  useEffect(() => {
    if (!focusMsg || focusMsg.startsWith('title:')) return;
    let cancelled = false;

    const found = () =>
      Boolean(document.querySelector(`[data-mid="${CSS.escape(focusMsg)}"]`));

    const run = async () => {
      await new Promise((r) => setTimeout(r, 280));
      if (cancelled) return;
      if (found()) {
        focusMessageById(focusMsg);
        return;
      }
      if (loadOlder) {
        for (let i = 0; i < 10; i++) {
          const hasMore = await loadOlder();
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, 60));
          if (found()) {
            focusMessageById(focusMsg);
            return;
          }
          if (!hasMore) break;
        }
      }
      if (!cancelled) focusMessageById(focusMsg);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [focusMsg, loadOlder]);
}
