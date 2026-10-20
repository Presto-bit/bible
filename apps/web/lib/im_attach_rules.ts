/** 加号附件：图片（含视频）/ 文档。短语音走麦克风，不在此列。 */

export const IM_MAX_ATTACH_BYTES = 50 * 1024 * 1024;

export const IM_IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/*,video/mp4,video/webm,video/quicktime,video/*,.jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.webm,.m4v';
export const IM_DOC_ACCEPT =
  'application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx';

export type ImAttachSlot = 'image' | 'doc';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v']);
const DOC_EXT = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']);

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

export function imAttachAccept(slot: ImAttachSlot): string {
  if (slot === 'image') return IM_IMAGE_ACCEPT;
  return IM_DOC_ACCEPT;
}

export function imAttachIsVideo(file: File): boolean {
  const ext = extOf(file.name);
  const mime = (file.type || '').toLowerCase();
  return VIDEO_EXT.has(ext) || (!ext && mime.startsWith('video/'));
}

/** 不合规则时返回说明；可以发送则返回 null。 */
export function imAttachError(file: File, slot: ImAttachSlot): string | null {
  if (file.size > IM_MAX_ATTACH_BYTES) return '单个文件不能超过 50MB';
  const ext = extOf(file.name);
  const mime = (file.type || '').toLowerCase();
  if (slot === 'image') {
    if (IMAGE_EXT.has(ext) || mime.startsWith('image/')) return null;
    if (imAttachIsVideo(file)) return null;
    return '请选择 jpg、png、webp、gif，或 mp4、mov、webm、m4v 视频';
  }
  if (DOC_EXT.has(ext)) return null;
  return '文件只接受 pdf 和 Office（doc、xls、ppt）';
}
