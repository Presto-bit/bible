/** 当前小爱会话选用的知识库（sessionStorage；新标签页默认平台库） */

export const DEFAULT_KB_ID = 'platform';

const KEY = 'presto_assistant_kb';

export function getSessionKnowledgeBaseId(): string {
  if (typeof window === 'undefined') return DEFAULT_KB_ID;
  try {
    return sessionStorage.getItem(KEY) || DEFAULT_KB_ID;
  } catch {
    return DEFAULT_KB_ID;
  }
}

export function setSessionKnowledgeBaseId(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(KEY, id || DEFAULT_KB_ID);
  } catch {
    /* ignore */
  }
}

export function resetSessionKnowledgeBaseId(): void {
  setSessionKnowledgeBaseId(DEFAULT_KB_ID);
}
