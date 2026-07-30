/** 检测用户是否显式要求「并列观点 / 争议题」作答。 */

const EXPLICIT_PHRASES = [
  '并列观点',
  '不同看法',
  '不同观点',
  '各家怎么说',
  '各家怎么看',
  '有争议吗',
  '有没有争议',
  '争议',
  '两派',
  '几种理解',
  '多种理解',
  '双方观点',
  '正反两边',
  '不同传统',
  '不同教派',
];

/** 轻量争议主题词：命中后建议走并列观点（不强制改写用户问题）。 */
const TOPIC_HINTS = [
  '预定论',
  '拣选',
  '一次得救',
  '恩赐',
  '方言',
  '洗脚',
  '离婚再婚',
  '再婚',
  '守安息日',
  '洗礼方式',
  '浸礼',
  '圣餐',
  '女性讲道',
  '女人讲道',
  '女人蒙头',
  '创造论',
  '进化',
  '千禧年',
  '被提',
];

export function detectsViewpointsIntent(question: string): boolean {
  const q = (question || '').trim();
  if (!q) return false;
  if (EXPLICIT_PHRASES.some((p) => q.includes(p))) return true;
  // 「怎么看 X」类争议词：有主题词且含比较/看法语气
  if (TOPIC_HINTS.some((t) => q.includes(t))) {
    if (/怎么看|怎么说|如何理解|哪[个种]|还是|争议|分歧|看法|观点/.test(q)) {
      return true;
    }
  }
  return false;
}
