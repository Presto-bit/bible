import type { ShelfAttachment, ShelfSection } from '@/lib/shelf_api';

function isAudioAttachment(item: ShelfAttachment): boolean {
  if (item.kind === 'audio') return true;
  const mime = (item.mime || '').toLowerCase();
  return mime.startsWith('audio/');
}

export function shelfSectionAttachments(section: ShelfSection) {
  const all = section.attachments ?? [];
  return {
    images: all.filter((a) => a.kind === 'image'),
    videos: all.filter((a) => a.kind === 'video'),
    audios: all.filter(isAudioAttachment),
  };
}

export function shelfLessonMedia(section: ShelfSection): {
  images: ShelfAttachment[];
  videos: ShelfAttachment[];
  audios: ShelfAttachment[];
} {
  return shelfSectionAttachments(section);
}

export function shelfLessonHasMedia(section: ShelfSection): boolean {
  const { images, videos, audios } = shelfSectionAttachments(section);
  return images.length > 0 || videos.length > 0 || audios.length > 0;
}
