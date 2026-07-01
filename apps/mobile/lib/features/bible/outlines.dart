/// 分段标题（段落间小标题）。经文库无分段数据，这里内置常读章节的段落大纲，
/// 按「起始节 → 标题」给出；阅读器据此在对应节前插入分段标题。可持续扩充。
library;

class SectionMark {
  const SectionMark(this.verse, this.title);
  final int verse;
  final String title;
}

const Map<String, List<SectionMark>> kSectionOutlines = {
  'GEN.1': [
    SectionMark(1, '起初　神创造天地'),
    SectionMark(3, '第一日：光'),
    SectionMark(6, '第二日：穹苍'),
    SectionMark(9, '第三日：陆地与植物'),
    SectionMark(14, '第四日：日月星辰'),
    SectionMark(20, '第五日：水族与飞鸟'),
    SectionMark(24, '第六日：走兽与人'),
  ],
  'PSA.23': [SectionMark(1, '耶和华是我的牧者')],
  'JHN.1': [
    SectionMark(1, '道成了肉身'),
    SectionMark(19, '施洗约翰的见证'),
    SectionMark(35, '最初的门徒'),
  ],
  'JHN.3': [
    SectionMark(1, '尼哥德慕夜访耶稣'),
    SectionMark(16, '神爱世人'),
    SectionMark(22, '施洗约翰再次见证基督'),
  ],
  'MAT.5': [
    SectionMark(1, '登山宝训：八福'),
    SectionMark(13, '盐与光'),
    SectionMark(17, '论律法'),
    SectionMark(21, '论动怒'),
    SectionMark(27, '论奸淫'),
    SectionMark(38, '论报复与爱仇敌'),
  ],
  'ROM.8': [
    SectionMark(1, '随从圣灵而行的生命'),
    SectionMark(18, '将来的荣耀'),
    SectionMark(28, '神的爱永不隔绝'),
  ],
  '1CO.13': [SectionMark(1, '爱的真谛')],
  'LUK.15': [
    SectionMark(1, '迷失的羊'),
    SectionMark(8, '失落的钱币'),
    SectionMark(11, '浪子回头'),
  ],
  'GEN.2': [
    SectionMark(1, '第七日安息'),
    SectionMark(4, '伊甸园'),
    SectionMark(18, '造女人'),
  ],
  'GEN.3': [
    SectionMark(1, '人的堕落'),
    SectionMark(8, '神的审判'),
    SectionMark(20, '逐出伊甸园'),
  ],
  'EXO.20': [
    SectionMark(1, '十诫'),
    SectionMark(18, '百姓战兢远立'),
  ],
  'PSA.1': [SectionMark(1, '义人与恶人')],
  'PSA.19': [
    SectionMark(1, '诸天述说神的荣耀'),
    SectionMark(7, '耶和华的律法全备'),
  ],
  'PSA.91': [SectionMark(1, '住在至高者隐密处')],
  'PSA.121': [SectionMark(1, '耶和华是保护你的')],
  'PSA.139': [
    SectionMark(1, '神无所不知无所不在'),
    SectionMark(13, '神奇妙的创造'),
    SectionMark(19, '鉴察我的心思'),
  ],
  'PRO.3': [
    SectionMark(1, '专心仰赖耶和华'),
    SectionMark(13, '得智慧的有福'),
  ],
  'ISA.40': [
    SectionMark(1, '安慰我的百姓'),
    SectionMark(12, '无可比拟的神'),
    SectionMark(27, '主赐力量给疲乏的'),
  ],
  'ISA.53': [SectionMark(1, '受苦的仆人')],
  'MAT.6': [
    SectionMark(1, '论施舍'),
    SectionMark(5, '论祷告：主祷文'),
    SectionMark(16, '论禁食'),
    SectionMark(19, '论财宝在天'),
    SectionMark(25, '不要忧虑'),
  ],
  'MAT.7': [
    SectionMark(1, '不要论断人'),
    SectionMark(7, '祈求、寻找、叩门'),
    SectionMark(13, '窄门'),
    SectionMark(15, '凭果子认出树'),
    SectionMark(24, '两种根基'),
  ],
  'MAT.28': [
    SectionMark(1, '主复活了'),
    SectionMark(16, '大使命'),
  ],
  'MRK.1': [
    SectionMark(1, '施洗约翰预备道路'),
    SectionMark(9, '耶稣受洗与受试探'),
    SectionMark(14, '呼召门徒'),
    SectionMark(21, '赶鬼医病'),
  ],
  'LUK.2': [
    SectionMark(1, '耶稣降生'),
    SectionMark(8, '牧羊人与天使'),
    SectionMark(21, '献于圣殿'),
    SectionMark(41, '少年耶稣在圣殿'),
  ],
  'JHN.14': [
    SectionMark(1, '我就是道路真理生命'),
    SectionMark(15, '应许赐下圣灵'),
  ],
  'JHN.15': [
    SectionMark(1, '我是真葡萄树'),
    SectionMark(9, '彼此相爱'),
    SectionMark(18, '世界的恨'),
  ],
  'ACT.2': [
    SectionMark(1, '圣灵降临'),
    SectionMark(14, '彼得的讲道'),
    SectionMark(42, '初代教会的生活'),
  ],
  'ROM.12': [
    SectionMark(1, '将身体献上当作活祭'),
    SectionMark(9, '爱人的真诚'),
  ],
  '1CO.15': [
    SectionMark(1, '基督复活的福音'),
    SectionMark(12, '死人复活'),
    SectionMark(35, '复活的身体'),
  ],
  'GAL.5': [
    SectionMark(1, '在自由里站立得稳'),
    SectionMark(16, '顺着圣灵而行'),
    SectionMark(22, '圣灵的果子'),
  ],
  'EPH.6': [
    SectionMark(1, '儿女与父母'),
    SectionMark(5, '仆人与主人'),
    SectionMark(10, '神所赐的全副军装'),
  ],
  'PHP.4': [
    SectionMark(1, '靠主常常喜乐'),
    SectionMark(4, '一无挂虑'),
    SectionMark(10, '知足的秘诀'),
  ],
  'HEB.11': [SectionMark(1, '信心的见证人')],
  'JAS.1': [
    SectionMark(1, '试炼与忍耐'),
    SectionMark(19, '行道与听道'),
  ],
  '1PE.1': [
    SectionMark(1, '活泼的盼望'),
    SectionMark(13, '要圣洁'),
  ],
  'PRO.31': [
    SectionMark(1, '利慕伊勒王的言语'),
    SectionMark(10, '才德的妇人'),
  ],
  'REV.21': [
    SectionMark(1, '新天新地'),
    SectionMark(9, '新耶路撒冷'),
  ],
};

List<SectionMark> outlineFor(String bookId, int chapter) =>
    kSectionOutlines['${bookId.toUpperCase()}.$chapter'] ?? const [];
