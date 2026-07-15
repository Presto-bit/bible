/** 通知勿扰偏好（PRODUCT §23.7） */

const KEY = 'presto_notif_prefs_v1';

export type NotifPrefs = {
  /** 读经勿扰：默认开；圣经 Tab 不显示社交提示 */
  readingDnd: boolean;
  /** 社交聚合推送（群/私信摘要） */
  socialDigest: boolean;
  /** 断签召回（历史字段，兼容旧 EXTRA_KEY） */
  streakRecall: boolean;
};

const DEFAULTS: NotifPrefs = {
  readingDnd: true,
  socialDigest: false,
  streakRecall: false,
};

function readRaw(): Partial<NotifPrefs> {
  if (typeof window === 'undefined') return {};
  try {
    const modern = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (modern && typeof modern === 'object') return modern as Partial<NotifPrefs>;
  } catch {
    /* ignore */
  }
  // 兼容旧 push_digest EXTRA_KEY
  try {
    const legacy = JSON.parse(localStorage.getItem('presto_reminder_extra') || '{}');
    return {
      socialDigest: Boolean(legacy.group),
      streakRecall: Boolean(legacy.streak),
      readingDnd: legacy.reading_dnd !== false,
    };
  } catch {
    return {};
  }
}

export function getNotifPrefs(): NotifPrefs {
  const raw = readRaw();
  return {
    readingDnd: raw.readingDnd !== false,
    socialDigest: Boolean(raw.socialDigest),
    streakRecall: Boolean(raw.streakRecall),
  };
}

export function setNotifPrefs(patch: Partial<NotifPrefs>): NotifPrefs {
  const next = { ...getNotifPrefs(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  // 双写旧 key，兼容未改完的调用方
  localStorage.setItem(
    'presto_reminder_extra',
    JSON.stringify({
      group: next.socialDigest,
      streak: next.streakRecall,
      reading_dnd: next.readingDnd,
    }),
  );
  return next;
}

export function isReadingDndEnabled(): boolean {
  return getNotifPrefs().readingDnd;
}

/** 当前是否在圣经阅读相关路径（勿扰时抑制社交前台通知） */
export function isBibleReadingPath(pathname?: string): boolean {
  const p = pathname || (typeof window !== 'undefined' ? window.location.pathname : '');
  return (
    /\/bible(\/|$)/.test(p)
    || /\/read(\/|$)/.test(p)
    || /\/reader(\/|$)/.test(p)
  );
}
