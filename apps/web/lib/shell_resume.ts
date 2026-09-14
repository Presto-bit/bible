/** 壳回前台：旧 WebView / TWA 与 Flutter 嵌 H5 统一监听 */

export const SHELL_RESUME_EVENT = 'peiai-shell-resume';
export const FLUTTER_RESUME_EVENT = 'peiai-flutter-resume';

/** 注册 shell + Flutter resume；返回卸载函数 */
export function onShellOrFlutterResume(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(SHELL_RESUME_EVENT, handler);
  window.addEventListener(FLUTTER_RESUME_EVENT, handler);
  return () => {
    window.removeEventListener(SHELL_RESUME_EVENT, handler);
    window.removeEventListener(FLUTTER_RESUME_EVENT, handler);
  };
}
