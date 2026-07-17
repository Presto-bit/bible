/** 通知勿扰偏好（PRODUCT §23.7） */

const KEY = 'presto_notif_prefs_v1';

export type NotifPrefs = {
  /** 读经勿扰：默认开；圣经 Tab 不显示社交提示 */
  readingDnd: boolean;
  /** 社交聚合推送（群/私信摘要）；默认关，开启后发消息约 1 分钟合并推一条 */
  socialDigest: boolean;
  /** 断签召回（历史字段，兼容旧 EXTRA_KEY） */
  streakRecall: boolean;
};

const DEFAULTS: NotifPrefs = {
  readingDnd: true,
  socialDigest: false,
  streakRecall: false,
};

function readStored(): Partial<NotifPrefs> {
  if (typeof window === 'undefined') return {};
  try {
    const modern = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (modern && typeof modern === 'object') {
      const out: Partial<NotifPrefs> = {};
      if ('readingDnd' in modern) out.readingDnd = Boolean(modern.readingDnd);
      if ('socialDigest' in modern) out.socialDigest = Boolean(modern.socialDigest);
      if ('streakRecall' in modern) out.streakRecall = Boolean(modern.streakRecall);
      return out;
    }
  } catch {
    /* ignore */
  }
  // 兼容旧 push_digest EXTRA_KEY（仅当显式写过 group 才覆盖默认）
  try {
    const legacy = JSON.parse(localStorage.getItem('presto_reminder_extra') || 'null');
    if (legacy && typeof legacy === 'object') {
      const out: Partial<NotifPrefs> = {};
      if ('group' in legacy) out.socialDigest = Boolean(legacy.group);
      if ('streak' in legacy) out.streakRecall = Boolean(legacy.streak);
      if ('reading_dnd' in legacy) out.readingDnd = legacy.reading_dnd !== false;
      return out;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function getNotifPrefs(): NotifPrefs {
  const raw = readStored();
  return {
    readingDnd: raw.readingDnd !== undefined ? raw.readingDnd : DEFAULTS.readingDnd,
    socialDigest: raw.socialDigest !== undefined ? raw.socialDigest : DEFAULTS.socialDigest,
    streakRecall: raw.streakRecall !== undefined ? raw.streakRecall : DEFAULTS.streakRecall,
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
