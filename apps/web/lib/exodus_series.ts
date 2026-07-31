/** 出埃及故事图册：系列 / 章 / 拍（横滑播放器协议） */

export type BeatMedia = 'cover' | 'map' | 'diagram' | 'portrait' | 'quote' | 'fin';

export type StoryBeat = {
  id: string;
  media: BeatMedia;
  title: string;
  /** 主旁白：冲突 + 转折（约 70–110 字） */
  narration: string;
  /** 洞察：这一拍在整条因果里的意义（约 40–70 字） */
  insight?: string;
  ref?: string;
  ask_seed?: string;
  place_id?: string;
  diagram_id?: string;
  hotspot_id?: string;
  entity_label?: string;
  relation?: string;
  fin_kind?: 'episode' | 'series';
};

export type StoryEpisode = {
  id: string;
  title: string;
  hook: string;
  closing: string;
  source?: { kind: 'map' | 'diagram' | 'graph'; id: string };
  beats: StoryBeat[];
};

export type ExodusStorySeries = {
  id: string;
  title: string;
  hook: string;
  minutes: number;
  disclaimer: string;
  closing: string;
  episodes: StoryEpisode[];
};

export const EXODUS_SERIES_ID = 'exodus';

export const EXODUS_STORY: ExodusStorySeries = {
  id: EXODUS_SERIES_ID,
  title: '出埃及故事',
  hook: '用约 12 分钟，看清从为奴到立约、再到神住在中间的一条线',
  minutes: 12,
  disclaimer: '传统示意 · 非考古定论',
  closing: '从哀声到立约，神要住在百姓中间——敬拜由此开始。',
  episodes: [
    {
      id: 'wilderness',
      title: '旷野行程',
      hook: '跟从兰塞方向到西奈：拯救如何一步步变成立约之路。',
      closing: '百姓来到山前；下一章看神如何住在他们中间。',
      source: { kind: 'map', id: 'exodus-wilderness' },
      beats: [
        {
          id: 'w-cover',
          media: 'cover',
          title: '第 1 章 · 旷野行程',
          narration: '出埃及不是「逃出来」就结束，而是一连串地点上的转折：哀声、开路、试验、供应，直到山前立约。',
          insight: '左右滑翻页；点地图站点可看简介。路线为传统示意。',
        },
        {
          id: 'w-egypt',
          media: 'map',
          title: '埃及 · 为奴之地',
          place_id: 'egypt',
          ref: 'EXO 1:11',
          narration: '法老用苦工压榨以色列人，要抹去他们的盼望。百姓的哀声上达于神——故事不是从人的勇敢开始，而是从神听见开始。',
          insight: '若没有「听见」，后面的过海与立约都失去起点。拯救先是神的主动。',
          ask_seed: '以色列人为何在埃及为奴？神如何预备拯救？',
        },
        {
          id: 'w-red-sea',
          media: 'map',
          title: '红海 · 无路可走',
          place_id: 'red-sea',
          ref: 'EXO 14:21',
          narration: '前有大海、后有追兵，人算尽了。神分开海水，百姓走干地过去——出埃及最醒目的神迹，把「谁能救」写进他们的记忆。',
          insight: '后来诗篇与先知常回望红海：不是旅游景点，而是「耶和华争战」的记号。',
          ask_seed: '过红海在后来的圣经里常如何被记念？',
        },
        {
          id: 'w-marah',
          media: 'map',
          title: '玛拉 · 苦水',
          place_id: 'marah',
          ref: 'EXO 15:23',
          narration: '才过红海三日，水苦不能喝，抱怨就起。神指示摩西把树丢在水里，水变甜——拯救之后，仍有试验与管教。',
          insight: '出埃及不是进入无痛之地；旷野教会人：跟随神的路，仍要学习信靠。',
          ask_seed: '玛拉苦水变甜说明神怎样对待抱怨中的百姓？',
        },
        {
          id: 'w-elim',
          media: 'map',
          title: '以琳 · 绿洲',
          place_id: 'elim',
          ref: 'EXO 15:27',
          narration: '十二股水泉、七十棵棕树。苦水之后，神也赐下可安营的地方——不是永远停住，却是旅途中真实的供应。',
          insight: '叙事有张有弛：试验与休息交替，显明神既管教也牧养。',
          ask_seed: '以琳的水泉与棕树，在叙事里起什么作用？',
        },
        {
          id: 'w-rephidim',
          media: 'map',
          title: '利非订 · 磐石与争战',
          place_id: 'rephidim',
          ref: 'EXO 17:6',
          narration: '百姓再次因无水与摩西争闹；神吩咐击打磐石，水就流出。随后亚玛力人来攻，摩西举手，约书亚争战——同在显在供应，也显在守护。',
          insight: '「耶和华是我的旌旗」写在这里：人软弱争闹，神仍选择与他们同在。',
          ask_seed: '利非订的磐石出水与争战，显明神怎样与百姓同在？',
        },
        {
          id: 'w-sinai',
          media: 'map',
          title: '西奈山 · 朝见',
          place_id: 'mount-sinai',
          ref: 'EXO 19:1',
          narration: '出埃及后第三个月，百姓在山前安营。路程走到这里，主题从「逃出」转向「朝见」：神要与他们立约，使他们成为祭司的国度。',
          insight: '地理终点不是目的；立约才是。下一拍听见山上降下的话。',
          ask_seed: '来到西奈山前，神对以色列人的呼召是什么？',
        },
        {
          id: 'w-quote',
          media: 'quote',
          title: '立约：祭司的国度',
          ref: 'EXO 19:20',
          narration: '耶和华降临在山上，颁布十诫与约法。百姓答应遵行——他们不再只是被救的奴隶，而是被召去敬拜、服事的国度。随后，神也启示建造会幕。',
          insight: '约把「拯救」接上「同在」：下章会幕，就是神住在中间的空间安排。',
          ask_seed: '西奈之约与后来的会幕敬拜有何关系？',
        },
        {
          id: 'w-fin',
          media: 'fin',
          fin_kind: 'episode',
          title: '本章完成',
          narration: '人出了埃及，约立在山上。下一章走进会幕：神如何住在百姓中间。',
          insight: '你已走过：哀声 → 开路 → 试验 → 供应 → 立约。',
        },
      ],
    },
    {
      id: 'tabernacle',
      title: '会幕平面图',
      hook: '外院、圣所、至圣所、约柜：分区是为了圣洁地靠近。',
      closing: '会幕立起，敬拜有了空间；再看神使用了哪些人。',
      source: { kind: 'diagram', id: 'tabernacle-layout' },
      beats: [
        {
          id: 't-cover',
          media: 'cover',
          title: '第 2 章 · 会幕平面图',
          narration: '神说：「又当为我造圣所，使我可以住在他们中间。」会幕不是奇观展览，而是同在的住所——按热区一处一处看。',
          insight: '尺寸非按比例；重点是分区与器物的意义。',
        },
        {
          id: 't-court',
          media: 'diagram',
          diagram_id: 'tabernacle-layout',
          hotspot_id: 'court',
          title: '外院 · 入口',
          ref: 'EXO 27:9',
          narration: '百姓可到的最外层：燔祭坛与洗濯盆在此。靠近神，先经过献祭与洁净——罪与污秽不能装作看不见。',
          insight: '外院回答「人凭什么进来」：不是好奇，而是被洁净、被接纳。',
          ask_seed: '外院的祭坛与洗濯盆各自指向什么属灵意义？',
        },
        {
          id: 't-holy',
          media: 'diagram',
          diagram_id: 'tabernacle-layout',
          hotspot_id: 'holy',
          title: '圣所 · 日常事奉',
          ref: 'EXO 26:33',
          narration: '帷幔之内是祭司日常之处：金灯台照明、陈设饼供应、香坛代求。敬拜不是偶尔高潮，而是持续的服事节奏。',
          insight: '光照、饼、香——同在落实在「每天」里，不只在节期。',
          ask_seed: '圣所里的三件器物如何互相补充？',
        },
        {
          id: 't-most-holy',
          media: 'diagram',
          diagram_id: 'tabernacle-layout',
          hotspot_id: 'most-holy',
          title: '至圣所 · 最深处',
          ref: 'EXO 26:34',
          narration: '再一层帷幔之后，是至圣所。唯大祭司一年一次可入——神的圣洁要求距离，也预告将来幔子裂开时的道路。',
          insight: '「不能随便进」不是冷酷，而是提醒：同在极美，也极重。',
          ask_seed: '至圣所与新约「幔子裂开」有何关联？',
        },
        {
          id: 't-ark',
          media: 'diagram',
          diagram_id: 'tabernacle-layout',
          hotspot_id: 'ark',
          title: '约柜 · 中心',
          ref: 'EXO 25:10',
          narration: '约柜在至圣所中央，上有施恩座与基路伯。约的版在柜中，赦免的记号在座上——律法与恩典在同一中心相遇。',
          insight: '会幕一切分区，最终指向这里：神与百姓以约相会。',
          ask_seed: '约柜为何成为会幕敬拜的中心？',
        },
        {
          id: 't-quote',
          media: 'quote',
          title: '「使我可以住在他们中间」',
          ref: 'EXO 25:8',
          narration: '出埃及的目标不只是自由，更是同在。会幕把西奈的约，落成可以安营、可以敬拜的空间——神愿意走在百姓的路程里。',
          insight: '读会幕，是在读「神要怎样与人同住」。',
        },
        {
          id: 't-fin',
          media: 'fin',
          fin_kind: 'episode',
          title: '本章完成',
          narration: '空间的秩序明白了。下一章：摩西、亚伦与关键地标——人如何被织进这条拯救线。',
          insight: '外院 → 圣所 → 至圣所 → 约柜，是一条「靠近」的路径。',
        },
      ],
    },
    {
      id: 'people',
      title: '核心人物',
      hook: '摩西、亚伦、红海、西奈、会幕：把人与地标收成一条脉络。',
      closing: '人与地标串起来，出埃及的因果就清楚了。',
      source: { kind: 'graph', id: 'exodus-core' },
      beats: [
        {
          id: 'p-cover',
          media: 'cover',
          title: '第 3 章 · 核心人物',
          narration: '同一条拯救，落在具体的人身上：蒙召的、配搭的、记念的地点、立约的山、同在的帐幕。一拍收一段。',
          insight: '看「谁被使用」，也看「神怎样使用软弱的人」。',
        },
        {
          id: 'p-moses',
          media: 'portrait',
          title: '摩西 · 蒙召',
          entity_label: '摩西',
          relation: '蒙召前往法老',
          ref: 'EXO 3:10',
          narration: '荆棘火焰中，神呼召逃到米甸的摩西：去见法老，领百姓出来。他推辞、害怕、觉得不能说话——使命却仍落在他肩上。',
          insight: '神不找「已经完美的领袖」，而找愿意被差遣的人；软弱被纳入计划，不是被取消。',
          ask_seed: '摩西为何多次推辞？神如何回应他的软弱？',
        },
        {
          id: 'p-aaron',
          media: 'portrait',
          title: '亚伦 · 同工',
          entity_label: '亚伦',
          relation: '作摩西的口',
          ref: 'EXO 4:14',
          narration: '神为摩西预备亚伦作帮手：他成为「口」，一同面对法老，也在后来的敬拜中服事。出埃及是配搭，不是独行英雄史。',
          insight: '关键角色会摇摆（金牛犊也有亚伦），但叙事仍显明：神的工作常借着共同体完成。',
          ask_seed: '亚伦在出埃及故事里扮演哪些关键角色？',
        },
        {
          id: 'p-sea',
          media: 'portrait',
          title: '红海 · 拯救的记号',
          entity_label: '红海',
          relation: '耶和华争战',
          ref: 'EXO 14:29',
          narration: '过海之后，埃及军兵倾覆。百姓中有人唱摩西的歌，也很快再抱怨——神迹不自动产生长久信心，却成为必须回望的根基。',
          insight: '地点成为记忆：每当忘记「谁救了我们」，红海就在故事里被再次提起。',
          ask_seed: '红海事件如何塑造以色列人对神的认识？',
        },
        {
          id: 'p-covenant',
          media: 'portrait',
          title: '西奈 · 立约',
          entity_label: '西奈山',
          relation: '约与律法',
          ref: 'EXO 19:8',
          narration: '百姓答应：「凡耶和华所说的，我们都要遵行。」立约重新定义关系：他们是属神的子民，不是无家可归的逃亡者。',
          insight: '约既是身份，也是道路——随后的会幕与律法，都从这句回应展开。',
          ask_seed: '西奈之约怎样定义以色列与神的关系？',
        },
        {
          id: 'p-tabernacle',
          media: 'portrait',
          title: '会幕与约柜 · 同在',
          entity_label: '会幕 · 约柜',
          relation: '神住在中间',
          ref: 'EXO 25:8',
          narration: '神要住在百姓中间；约柜成为至圣所的中心。人、约、空间终于合拢：拯救的终点，是同在的敬拜。',
          insight: '出埃及三章收束在此：路走到山，山指向帐，帐指向那位愿意亲近的神。',
          ask_seed: '会幕与约柜如何指向神愿意与人同住？',
        },
        {
          id: 'p-quote',
          media: 'quote',
          title: '串起来看',
          narration: '哀声被听见，海路被打开，试验中有供应，山上有约，帐中有同在。出埃及的主线不是「我们多能干」，而是「神要得着一群敬拜他的子民」。',
          insight: '若只用一句话记住：神拯救，为要同住。',
        },
        {
          id: 'p-fin',
          media: 'fin',
          fin_kind: 'series',
          title: '出埃及故事 · 已走完',
          narration: '从哀声到立约，神要住在百姓中间——敬拜由此开始。你可以分享这一程，或回到经文里慢慢读。',
          insight: '建议：打开出埃及记 14、19、25，把图册走过的站对照着读一遍。',
        },
      ],
    },
  ],
};

export function exodusCoverHref(): string {
  return `/search/series/${EXODUS_SERIES_ID}`;
}

export function exodusPlayHref(episodeIndex = 0, beatIndex = 0): string {
  const q = new URLSearchParams({
    ep: String(Math.max(0, episodeIndex)),
    beat: String(Math.max(0, beatIndex)),
  });
  return `/search/series/${EXODUS_SERIES_ID}/play?${q.toString()}`;
}

export function getExodusEpisode(index: number): StoryEpisode | null {
  return EXODUS_STORY.episodes[index] ?? null;
}

export function findBeatIndexByPlace(episode: StoryEpisode, placeId: string): number {
  return episode.beats.findIndex((b) => b.media === 'map' && b.place_id === placeId);
}

export function findBeatIndexByHotspot(episode: StoryEpisode, hotspotId: string): number {
  return episode.beats.findIndex((b) => b.media === 'diagram' && b.hotspot_id === hotspotId);
}
