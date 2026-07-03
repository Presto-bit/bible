/** PWA / 移动端轻触觉反馈 */
export function hapticSuccess() {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate([10, 36, 14]);
  } catch {
    /* ignore */
  }
}

export function hapticLight() {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate(8);
  } catch {
    /* ignore */
  }
}
