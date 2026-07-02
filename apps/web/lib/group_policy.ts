/** 共读群超过该天数无任何动态后，服务端会静默清理。 */
export const GROUP_INACTIVE_DAYS = 30;

export const GROUP_INACTIVE_NOTICE =
  `若群超过 ${GROUP_INACTIVE_DAYS} 天没有任何打卡、任务或动态，系统会自动清理该群，不会另行通知。`;

export function groupInactiveMs(): number {
  return GROUP_INACTIVE_DAYS * 24 * 60 * 60 * 1000;
}
