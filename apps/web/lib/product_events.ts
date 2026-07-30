/** 12 个产品功能事件：入库 + 管理台功能排行 */

import { API_BASE, authHeaders } from './api';
import { getDeviceId } from './device_id';

export const PRODUCT_EVENTS = [
  'app_open',
  'daily_verse_view',
  'daily_verse_like',
  'reader_open',
  'reader_session_end',
  'plan_start',
  'plan_day_done',
  'ai_ask',
  'reminder_enable',
  'warmup_finish',
  'discover_open',
  'share_out',
] as const;

export type ProductEventName = (typeof PRODUCT_EVENTS)[number];

const EVENT_SET = new Set<string>(PRODUCT_EVENTS);

/** 同日同事件去重（避免 Tab 切换刷爆） */
const onceKeys = new Set<string>();

function chinaDayKey(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function onceKey(event: string, salt = ''): string {
  return `${chinaDayKey()}:${event}:${salt}`;
}

async function postEvent(
  event: ProductEventName,
  props: Record<string, unknown>,
  path: string,
): Promise<boolean> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders(),
  };
  const deviceId = getDeviceId();
  if (deviceId) headers['X-Device-Id'] = deviceId;

  const body = JSON.stringify({ event, props, path });
  const urls = [`${API_BASE}/analytics/events`, `${API_BASE}/content/product-event`];
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'POST', headers, body, keepalive: true });
      if (res.ok) return true;
    } catch {
      /* try fallback */
    }
  }
  return false;
}

/**
 * 上报产品事件。oncePerDay 时同日同 salt 只发一次。
 */
export function trackProductEvent(
  event: ProductEventName | string,
  opts: {
    props?: Record<string, unknown>;
    oncePerDay?: boolean;
    onceSalt?: string;
  } = {},
): void {
  if (typeof window === 'undefined') return;
  if (!EVENT_SET.has(event)) return;
  const name = event as ProductEventName;
  if (opts.oncePerDay) {
    const key = onceKey(name, opts.onceSalt || '');
    if (onceKeys.has(key)) return;
    onceKeys.add(key);
  }
  const path = typeof location !== 'undefined' ? location.pathname : '';
  void postEvent(name, opts.props || {}, path);
  void import('./pwa_first_open').then((m) => m.maybeEmitPwaValue(name));
}

/** 打开 App：每自然日一次 */
export function trackAppOpen(): void {
  trackProductEvent('app_open', { oncePerDay: true });
}
