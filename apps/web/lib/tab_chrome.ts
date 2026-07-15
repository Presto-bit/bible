/** Tab 切换时延后改 body class，先让 pane 显隐完成再刷全局样式，减轻同步布局卡顿。 */

type ChromeJob = () => void;

let scheduled = false;
const queue: ChromeJob[] = [];

function flush() {
  scheduled = false;
  const jobs = queue.splice(0, queue.length);
  for (const job of jobs) {
    try {
      job();
    } catch {
      /* ignore */
    }
  }
}

/** 在双 rAF 后执行（约一帧绘制之后）。离开 Tab 时请同步清理，不要走这里。 */
export function scheduleTabChrome(job: ChromeJob): void {
  if (typeof window === 'undefined') {
    job();
    return;
  }
  queue.push(job);
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(flush);
  });
}
