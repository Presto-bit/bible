export type ImFilePreviewMode =
  | 'pdf'
  | 'text'
  | 'markdown'
  | 'csv'
  | 'docx'
  | 'sheet'
  | 'server-pdf'
  | 'download';

const TEXT_MAX_BYTES = 512 * 1024;

export function fileExt(name?: string | null): string {
  const n = (name || '').toLowerCase();
  const i = n.lastIndexOf('.');
  return i >= 0 ? n.slice(i) : '';
}

export function detectFilePreviewMode(
  mime?: string | null,
  fileName?: string | null,
): ImFilePreviewMode {
  const ext = fileExt(fileName);
  const m = (mime || '').toLowerCase();

  if (m.includes('pdf') || ext === '.pdf') return 'pdf';
  if (ext === '.md' || m.includes('markdown')) return 'markdown';
  if (ext === '.csv' || m.includes('csv')) return 'csv';
  if (
    ext === '.txt'
    || m.startsWith('text/plain')
    || m.startsWith('text/')
  ) {
    return 'text';
  }
  if (ext === '.docx' || m.includes('wordprocessingml')) return 'docx';
  if (ext === '.xls' || ext === '.xlsx' || m.includes('spreadsheet') || m.includes('ms-excel')) {
    return 'sheet';
  }
  if (ext === '.doc' || ext === '.ppt' || ext === '.pptx' || m.includes('ms-powerpoint')) {
    return 'server-pdf';
  }
  return 'download';
}

export async function fetchTextPreview(url: string, maxBytes = TEXT_MAX_BYTES): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('文件加载失败');
  const buf = await res.arrayBuffer();
  if (buf.byteLength > maxBytes) {
    throw new Error('文件过大，请下载后查看');
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\r') {
      /* skip */
    } else {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export function openInSystemBrowser(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}
