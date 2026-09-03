import { api, contentAssetUrl } from '@/lib/api';
import { fileExt } from '@/lib/im_file_preview';
import { detectImMediaKind } from '@/lib/im_av';
import type { ImPopoverAction } from '@/components/social/ImMsgActionPopover';
import { importPlatformShelfBook, invalidateShelfListCache } from '@/lib/shelf_api';
import {
  formatShelfCheckinLabel,
  isShelfRef,
  parseShelfRef,
  rememberShelfRefLabel,
} from '@/lib/shelf_checkin';
import { pinShelfBookToLibrary, SHELF_IMPORT_MAX_BYTES } from '@/lib/shelf_library';

export const SHELF_IMPORTABLE_EXTS = new Set(['.docx', '.md', '.markdown', '.txt']);

type ImAttachment = {
  file_name?: string | null;
  mime?: string | null;
  size_bytes?: number | null;
  storage_key?: string | null;
  url?: string | null;
};

type ImMessageLike = {
  ref?: string | null;
  kind?: string | null;
  attachments?: ImAttachment[] | null;
};

function isShelfBookMessage(message: ImMessageLike): boolean {
  return message.kind === 'checkin' && Boolean(message.ref && isShelfRef(message.ref));
}

function isShelfFileMessage(message: ImMessageLike): boolean {
  if (message.kind !== 'file') return false;
  return findShelfImportableAttachment(message) != null;
}

export function shouldShowShelfImActions(message: ImMessageLike): boolean {
  return isShelfBookMessage(message) || isShelfFileMessage(message);
}

export function findShelfImportableAttachment(
  message: ImMessageLike,
): ImAttachment | null {
  const attachments = message.attachments ?? [];
  for (const att of attachments) {
    if (isShelfImportableAttachment(att.file_name, att.mime, message.kind)) return att;
  }
  return null;
}

export function isShelfImportableAttachment(
  fileName?: string | null,
  mime?: string | null,
  messageKind?: string | null,
): boolean {
  if (detectImMediaKind(mime, fileName, messageKind) !== 'file') return false;
  return SHELF_IMPORTABLE_EXTS.has(fileExt(fileName));
}

export async function saveShelfBookFromRef(ref: string): Promise<{ bookId: string; title: string }> {
  const parsed = parseShelfRef(ref);
  if (!parsed) throw new Error('无效的书架引用');
  pinShelfBookToLibrary(parsed.bookId);
  try {
    const { getPlatformShelfBook } = await import('@/lib/shelf_api');
    const book = await getPlatformShelfBook(parsed.bookId);
    rememberShelfRefLabel(ref, formatShelfCheckinLabel(book.title, '推荐书目'));
    return { bookId: parsed.bookId, title: book.title };
  } catch {
    return { bookId: parsed.bookId, title: '书目' };
  }
}

export async function importImAttachmentToShelf(att: ImAttachment): Promise<{ id: string; title: string }> {
  if (att.size_bytes && att.size_bytes > SHELF_IMPORT_MAX_BYTES) {
    throw new Error('文件超过 20MB，无法导入书架');
  }
  const blob = att.storage_key
    ? await api.previewSocialMedia(att.storage_key)
    : await fetch(contentAssetUrl(att.url || '')).then((res) => {
        if (!res.ok) throw new Error('文件下载失败');
        return res.blob();
      });
  const fileName = att.file_name || 'book.docx';
  const file = new File([blob], fileName, { type: att.mime || blob.type || 'application/octet-stream' });
  const res = await importPlatformShelfBook(file);
  pinShelfBookToLibrary(res.id);
  invalidateShelfListCache();
  return res;
}

export function buildShelfImPopoverActions(
  message: ImMessageLike,
  toast: (msg: string) => void,
): ImPopoverAction[] {
  const items: ImPopoverAction[] = [];

  if (isShelfBookMessage(message)) {
    items.push({
      id: 'shelf-save-ref',
      label: '保存到书柜',
      icon: '📚',
      onClick: () => {
        void saveShelfBookFromRef(message.ref!)
          .then(({ title }) => toast(`已加入书柜：《${title}》`))
          .catch((e) => toast(e instanceof Error ? e.message : '保存失败'));
      },
    });
  }

  if (isShelfFileMessage(message)) {
    const importAtt = findShelfImportableAttachment(message);
    if (!importAtt) return items;
    items.push({
      id: 'shelf-import-file',
      label: '存入书柜',
      icon: '📥',
      onClick: () => {
        void importImAttachmentToShelf(importAtt)
          .then(({ title }) => toast(`已导入书柜：《${title}》`))
          .catch((e) => toast(e instanceof Error ? e.message : '导入失败'));
      },
    });
  }

  return items;
}
