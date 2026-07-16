/** 失败消息队列：localStorage 持久化文本；媒体仍用内存 File。 */

export type QueuedTextSend = {
  id: string;
  scope: 'group' | 'dm';
  refId: string;
  body: string;
  replyToId?: string;
  mentions?: string[];
  kind?: string;
  ref?: string;
};

const STORAGE_KEY = 'presto_im_failed_text_v1';
const mediaFiles = new Map<string, File>();

function readAll(): QueuedTextSend[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? (raw as QueuedTextSend[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: QueuedTextSend[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function enqueueFailedText(item: QueuedTextSend) {
  const all = readAll();
  if (!all.some((x) => x.id === item.id)) {
    all.push(item);
    writeAll(all);
  }
}

export function dequeueFailedText(id: string) {
  const all = readAll().filter((x) => x.id !== id);
  writeAll(all);
}

export function listFailedText(scope: 'group' | 'dm', refId: string): QueuedTextSend[] {
  return readAll().filter((x) => x.scope === scope && x.refId === refId);
}

export function rememberMediaFile(tempId: string, file: File) {
  mediaFiles.set(tempId, file);
}

export function takeMediaFile(tempId: string): File | undefined {
  const f = mediaFiles.get(tempId);
  mediaFiles.delete(tempId);
  return f;
}

export function peekMediaFile(tempId: string): File | undefined {
  return mediaFiles.get(tempId);
}

/** 启动时恢复内存视图（供调试/统计） */
export function allFailedTextCount(): number {
  return readAll().length;
}
