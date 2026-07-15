/** 失败消息内存队列：联网后可批量重试文本；媒体保留 File 句柄。 */

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

const textQueue: QueuedTextSend[] = [];
const mediaFiles = new Map<string, File>();

export function enqueueFailedText(item: QueuedTextSend) {
  const exists = textQueue.some((x) => x.id === item.id);
  if (!exists) textQueue.push(item);
}

export function dequeueFailedText(id: string) {
  const i = textQueue.findIndex((x) => x.id === id);
  if (i >= 0) textQueue.splice(i, 1);
}

export function listFailedText(scope: 'group' | 'dm', refId: string): QueuedTextSend[] {
  return textQueue.filter((x) => x.scope === scope && x.refId === refId);
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
