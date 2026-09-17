/** 探索专题：退出手稿回列表时跳过重播入场动画 */

const SOFT_RETURN_KEY = 'beiai_knowledge_soft_return';

export function markKnowledgeSoftReturn(): void {
  try {
    sessionStorage.setItem(SOFT_RETURN_KEY, '1');
  } catch {
    /* private mode */
  }
}

export function consumeKnowledgeSoftReturn(): boolean {
  try {
    if (sessionStorage.getItem(SOFT_RETURN_KEY) === '1') {
      sessionStorage.removeItem(SOFT_RETURN_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
