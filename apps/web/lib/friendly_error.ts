export function friendlyError(err: unknown, fallback = '出了点问题，请稍后再试'): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const s = raw.trim();
  if (!s) return fallback;
  const lower = s.toLowerCase();
  if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('load failed')) {
    return '网络不太稳定，请检查连接后重试';
  }
  if (lower.includes('503') || lower.includes('暂不可用') || lower.includes('service unavailable')) {
    return '服务暂时不可用，你的本地数据已保留';
  }
  if (lower.includes('401') || lower.includes('密码') || lower.includes('账号')) {
    if (lower.includes('密码')) return s.length < 40 ? s : '密码不正确';
    return '账号验证失败，请重新恢复账号';
  }
  if (lower.includes('409') || lower.includes('占用')) return '该用户名已被占用';
  if (lower.includes('timeout')) return '请求超时，请稍后重试';
  if (/^\d{3}(\s|$)/.test(s) || lower.includes('sql') || lower.includes('migration') || lower.includes('postgres')) {
    return fallback;
  }
  if (s.length > 80) return fallback;
  return s;
}

export const errorMessage = friendlyError;
