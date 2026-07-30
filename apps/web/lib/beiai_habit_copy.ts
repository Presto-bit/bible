/** 今日温习 / 提醒：对齐彼爱静穆、零 guilt 文案 */

export function dailyWarmupTitle() {
  return '今日温习';
}

export function dailyWarmupSubtitle(done: boolean) {
  return done ? '今日已温习' : '五道轻问，巩固读过的经文';
}

export function dailyWarmupCta(done: boolean) {
  return done ? '再温习一次' : '开始温习';
}

export function dailyWarmupHubHint(done: boolean) {
  return done ? '今天已经温习过了，想再练也可以' : '错题会优先出现，不赶进度';
}

/** 完成页：鼓舞而非审判，不强调排名 */
export function dailyWarmupFinishLine(correct: number, total: number): string {
  if (total <= 0) return '今天先到这里也很好。';
  if (correct === total) return '都对上了。愿这些话语继续陪你。';
  if (correct === 0) return '答错也没关系，点开经文再读一遍就好。';
  if (correct >= Math.ceil(total * 0.6)) return '温习过了。不完美也很好，重要的是回来读。';
  return '已经温习过了。有不确定的，去读对应经文就好。';
}

export function quizAnswerPill(ok: boolean): string {
  return ok ? '答对了' : '参考答案';
}

export function reminderHeroTitle(enabled: boolean, timeLabel?: string) {
  if (enabled && timeLabel) return `每天 ${timeLabel}`;
  return '读经提醒未开启';
}

export function reminderHeroSub(enabled: boolean) {
  return enabled
    ? '到点轻声提醒，只叫你回来读一节'
    : '选一个时段即可；默认关闭，不打扰';
}
