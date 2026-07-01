// 分段标题（段落间小标题）。后端经文库无分段数据，这里内置常读章节的段落大纲，
// 按「起始节 → 标题」给出；阅读器据此在对应节前插入分段标题。可持续扩充。

export interface SectionMark {
  verse: number; // 该段起始节
  title: string;
}

export const SECTION_OUTLINES: Record<string, SectionMark[]> = {
  'GEN.1': [
    { verse: 1, title: '起初　神创造天地' },
    { verse: 3, title: '第一日：光' },
    { verse: 6, title: '第二日：穹苍' },
    { verse: 9, title: '第三日：陆地与植物' },
    { verse: 14, title: '第四日：日月星辰' },
    { verse: 20, title: '第五日：水族与飞鸟' },
    { verse: 24, title: '第六日：走兽与人' },
  ],
  'PSA.23': [{ verse: 1, title: '耶和华是我的牧者' }],
  'JHN.1': [
    { verse: 1, title: '道成了肉身' },
    { verse: 19, title: '施洗约翰的见证' },
    { verse: 35, title: '最初的门徒' },
  ],
  'JHN.3': [
    { verse: 1, title: '尼哥德慕夜访耶稣' },
    { verse: 16, title: '神爱世人' },
    { verse: 22, title: '施洗约翰再次见证基督' },
  ],
  'MAT.5': [
    { verse: 1, title: '登山宝训：八福' },
    { verse: 13, title: '盐与光' },
    { verse: 17, title: '论律法' },
    { verse: 21, title: '论动怒' },
    { verse: 27, title: '论奸淫' },
    { verse: 38, title: '论报复与爱仇敌' },
  ],
  'ROM.8': [
    { verse: 1, title: '随从圣灵而行的生命' },
    { verse: 18, title: '将来的荣耀' },
    { verse: 28, title: '神的爱永不隔绝' },
  ],
  '1CO.13': [{ verse: 1, title: '爱的真谛' }],
  'LUK.15': [
    { verse: 1, title: '迷失的羊' },
    { verse: 8, title: '失落的钱币' },
    { verse: 11, title: '浪子回头' },
  ],
  'GEN.2': [
    { verse: 1, title: '第七日安息' },
    { verse: 4, title: '伊甸园' },
    { verse: 18, title: '造女人' },
  ],
  'GEN.3': [
    { verse: 1, title: '人的堕落' },
    { verse: 8, title: '神的审判' },
    { verse: 20, title: '逐出伊甸园' },
  ],
  'EXO.20': [
    { verse: 1, title: '十诫' },
    { verse: 18, title: '百姓战兢远立' },
  ],
  'PSA.1': [{ verse: 1, title: '义人与恶人' }],
  'PSA.19': [
    { verse: 1, title: '诸天述说神的荣耀' },
    { verse: 7, title: '耶和华的律法全备' },
  ],
  'PSA.91': [{ verse: 1, title: '住在至高者隐密处' }],
  'PSA.121': [{ verse: 1, title: '耶和华是保护你的' }],
  'PSA.139': [
    { verse: 1, title: '神无所不知无所不在' },
    { verse: 13, title: '神奇妙的创造' },
    { verse: 19, title: '鉴察我的心思' },
  ],
  'PRO.3': [
    { verse: 1, title: '专心仰赖耶和华' },
    { verse: 13, title: '得智慧的有福' },
  ],
  'ISA.40': [
    { verse: 1, title: '安慰我的百姓' },
    { verse: 12, title: '无可比拟的神' },
    { verse: 27, title: '主赐力量给疲乏的' },
  ],
  'ISA.53': [{ verse: 1, title: '受苦的仆人' }],
  'MAT.6': [
    { verse: 1, title: '论施舍' },
    { verse: 5, title: '论祷告：主祷文' },
    { verse: 16, title: '论禁食' },
    { verse: 19, title: '论财宝在天' },
    { verse: 25, title: '不要忧虑' },
  ],
  'MAT.7': [
    { verse: 1, title: '不要论断人' },
    { verse: 7, title: '祈求、寻找、叩门' },
    { verse: 13, title: '窄门' },
    { verse: 15, title: '凭果子认出树' },
    { verse: 24, title: '两种根基' },
  ],
  'MAT.28': [
    { verse: 1, title: '主复活了' },
    { verse: 16, title: '大使命' },
  ],
  'MRK.1': [
    { verse: 1, title: '施洗约翰预备道路' },
    { verse: 9, title: '耶稣受洗与受试探' },
    { verse: 14, title: '呼召门徒' },
    { verse: 21, title: '赶鬼医病' },
  ],
  'LUK.2': [
    { verse: 1, title: '耶稣降生' },
    { verse: 8, title: '牧羊人与天使' },
    { verse: 21, title: '献于圣殿' },
    { verse: 41, title: '少年耶稣在圣殿' },
  ],
  'JHN.14': [
    { verse: 1, title: '我就是道路真理生命' },
    { verse: 15, title: '应许赐下圣灵' },
  ],
  'JHN.15': [
    { verse: 1, title: '我是真葡萄树' },
    { verse: 9, title: '彼此相爱' },
    { verse: 18, title: '世界的恨' },
  ],
  'ACT.2': [
    { verse: 1, title: '圣灵降临' },
    { verse: 14, title: '彼得的讲道' },
    { verse: 42, title: '初代教会的生活' },
  ],
  'ROM.12': [
    { verse: 1, title: '将身体献上当作活祭' },
    { verse: 9, title: '爱人的真诚' },
  ],
  '1CO.15': [
    { verse: 1, title: '基督复活的福音' },
    { verse: 12, title: '死人复活' },
    { verse: 35, title: '复活的身体' },
  ],
  'GAL.5': [
    { verse: 1, title: '在自由里站立得稳' },
    { verse: 16, title: '顺着圣灵而行' },
    { verse: 22, title: '圣灵的果子' },
  ],
  'EPH.6': [
    { verse: 1, title: '儿女与父母' },
    { verse: 5, title: '仆人与主人' },
    { verse: 10, title: '神所赐的全副军装' },
  ],
  'PHP.4': [
    { verse: 1, title: '靠主常常喜乐' },
    { verse: 4, title: '一无挂虑' },
    { verse: 10, title: '知足的秘诀' },
  ],
  'HEB.11': [{ verse: 1, title: '信心的见证人' }],
  'JAS.1': [
    { verse: 1, title: '试炼与忍耐' },
    { verse: 19, title: '行道与听道' },
  ],
  '1PE.1': [
    { verse: 1, title: '活泼的盼望' },
    { verse: 13, title: '要圣洁' },
  ],
  'PRO.31': [
    { verse: 1, title: '利慕伊勒王的言语' },
    { verse: 10, title: '才德的妇人' },
  ],
  'REV.21': [
    { verse: 1, title: '新天新地' },
    { verse: 9, title: '新耶路撒冷' },
  ],
};

export function outlineFor(bookId: string, chapter: number): SectionMark[] {
  return SECTION_OUTLINES[`${bookId.toUpperCase()}.${chapter}`] || [];
}
