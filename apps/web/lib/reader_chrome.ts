/** 离开经文阅读页时恢复全局壳层（目录、选章等）。 */
export function clearReaderChrome() {
  document.body.classList.remove('reader-active', 'reader-immersive');
  document.body.style.removeProperty('--reader-surface-bg');
  document.body.style.background = '';
  document.documentElement.style.background = '';
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', '#4f6b5d');
}
