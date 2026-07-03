const KEY = 'reader_return_href';

export function setReaderReturnHref(href: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(KEY, href);
}

export function getReaderReturnHref(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(KEY);
}

export function clearReaderReturnHref() {
  sessionStorage.removeItem(KEY);
}

export function readerBackHref(fallback = '/reader'): string {
  return getReaderReturnHref() || fallback;
}
