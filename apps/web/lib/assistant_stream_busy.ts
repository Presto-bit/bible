/** 小爱流式进行中标志：供 TabKeepAlive 避免 LRU 驱逐打断生成 */

let busy = false;
const listeners = new Set<() => void>();

export function setAssistantStreamBusy(next: boolean) {
  if (busy === next) return;
  busy = next;
  listeners.forEach((fn) => fn());
}

export function isAssistantStreamBusy() {
  return busy;
}

export function subscribeAssistantStreamBusy(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
