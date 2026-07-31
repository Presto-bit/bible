/** 出埃及故事图册：系列 / 章 / 拍（横滑播放器协议） */

export type BeatMedia = 'cover' | 'map' | 'diagram' | 'portrait' | 'quote' | 'fin';

export type StoryBeat = {
  id: string;
  media: BeatMedia;
  title: string;
  narration: string;
  ref?: string;
  ask_seed?: string;
  /** map */
  place_id?: string;
  /** diagram */
  diagram_id?: string;
  hotspot_id?: string;
  /** portrait / edge label */
  entity_label?: string;
  relation?: string;
  fin_kind?: 'episode' | 'series';
};

export type StoryEpisode = {
  id: string;
  title: string;
  hook: string;
  closing: string;
  /** 关联旧工具资源，便于总览 */
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
  hook: '用 10 分钟，走完出埃及最关键的三件事',
  minutes: 10,
  disclaimer: '传统示意 · 非考古定论',
  closing: '从哀声到立约，神要住在百姓中间——敬拜由此开始。',
  episodes: [
    {
      id: 'wilderness',
      title: '旷野行程',
      hook: '跟从兰塞到西奈，看立约之路如何展开。',
      closing: '百姓来到山前；下一章看神如何住在他们中间。',
      source: { kind: 'map', id: 'exodus-wilderness' },
      beats: [
        {
          id: 'w-cover',
          media: 'cover',
          title: '第 1 章 · 旷野行程',
          narration: '从为奴之地到西奈山：拯救怎样成为立约之路。左右滑继续。',
        },
        {
          id: 'w-egypt',
          media: 'map',
          title: '埃及',
          place_id: 'egypt',
          ref: 'EXO 1:11',
          narration: '百姓在法老的苦役下呻吟。神听见哀声，拯救的故事从此开始。',
          ask_seed: '以色列人为何在埃及为奴？神如何预备拯救？',
        },
        {
          id: 'w-red-sea',
          media: 'map',
          title: '红海',
          place_id: 'red-sea',
          ref: 'EXO 14:21',
          narration: '前有大海、后有追兵。神分开海水，让百姓走干地过去——出埃及的标志性神迹。',
          ask_seed: '过红海在后来的圣经里常如何被记念？',
        },
        {
          id: 'w-marah',
          media: 'map',
          title: '玛拉',
          place_id: 'marah',
          ref: 'EXO 15:23',
          narration: '三日行路后水苦不能喝。神使水变甜，也立下顺服的试验——拯救之后仍有供应与管教。',
          ask_seed: '玛拉苦水变甜说明神怎样对待抱怨中的百姓？',
        },
        {
          id: 'w-sinai-wilderness',
          media: 'map',
          title: '西奈旷野',
          place_id: 'wilderness-of-sinai',
          ref: 'EXO 19:1',
          narration: '出埃及后第三个月，百姓来到西奈的旷野，在山前安营，准备朝见神。',
          ask_seed: '来到西奈山前，神对以色列人的呼召是什么？',
        },
        {
          id: 'w-quote',
          media: 'quote',
          title: '西奈山',
          ref: 'EXO 19:20',
          narration: '耶和华降临在山上，颁布十诫与约法。百姓成为「祭司的国度」；随后神也启示建造会幕。',
          ask_seed: '西奈之约与后来的会幕敬拜有何关系？',
        },
        {
          id: 'w-fin',
          media: 'fin',
          fin_kind: 'episode',
          title: '本章完成',
          narration: '人出了埃及，约立在山上。下一章：看神如何住在百姓中间。',
        },
      ],
    },
    {
      id: 'tabernacle',
      title: '会幕平面图',
      hook: '看懂外院、圣所、至圣所与约柜如何分区。',
      closing: '会幕立起，敬拜有了空间；再看神使用了哪些人。',
      source: { kind: 'diagram', id: 'tabernacle-layout' },
      beats: [
        {
          id: 't-cover',
          media: 'cover',
          title: '第 2 章 · 会幕平面图',
          narration: '神说：「又当为我造圣所，使我可以住在他们中间。」点图或左右滑，按区看懂。',
        },
        {
          id: 't-court',
          media: 'diagram',
          diagram_id: 'tabernacle-layout',
          hotspot_id: 'court',
          title: '外院',
          ref: 'EXO 27:9',
          narration: '百姓可进入的区域，设有燔祭坛与洗濯盆——献祭与洁净的入口。',
          ask_seed: '外院的祭坛与洗濯盆各自指向什么属灵意义？',
        },
        {
          id: 't-holy',
          media: 'diagram',
          diagram_id: 'tabernacle-layout',
          hotspot_id: 'holy',
          title: '圣所',
          ref: 'EXO 26:33',
          narration: '祭司日常事奉之处：金灯台、陈设饼桌与香坛，象征光照、供应与代求。',
          ask_seed: '圣所里的三件器物如何互相补充？',
        },
        {
          id: 't-most-holy',
          media: 'diagram',
          diagram_id: 'tabernacle-layout',
          hotspot_id: 'most-holy',
          title: '至圣所',
          ref: 'EXO 26:34',
          narration: '帷幔隔开的最深处，唯大祭司一年一次可入，表明神的圣洁与同在。',
          ask_seed: '至圣所与新约「幔子裂开」有何关联？',
        },
        {
          id: 't-ark',
          media: 'diagram',
          diagram_id: 'tabernacle-layout',
          hotspot_id: 'ark',
          title: '约柜',
          ref: 'EXO 25:10',
          narration: '约柜安放在至圣所，上有施恩座，是约与赦免的记号，也是会幕敬拜的中心。',
          ask_seed: '约柜为何成为会幕敬拜的中心？',
        },
        {
          id: 't-quote',
          media: 'quote',
          title: '神要住在中间',
          ref: 'EXO 25:8',
          narration: '会幕不是给人参观的奇观，而是神愿意与百姓同住的安排。分区，是为了圣洁地靠近。',
        },
        {
          id: 't-fin',
          media: 'fin',
          fin_kind: 'episode',
          title: '本章完成',
          narration: '空间明白了；下一章理清摩西、亚伦与关键地标的关系。',
        },
      ],
    },
    {
      id: 'people',
      title: '核心人物',
      hook: '理清摩西、亚伦与红海、西奈、会幕的关系脉络。',
      closing: '人与地标串起来，出埃及的因果就清楚了。',
      source: { kind: 'graph', id: 'exodus-core' },
      beats: [
        {
          id: 'p-cover',
          media: 'cover',
          title: '第 3 章 · 核心人物',
          narration: '一拍一条脉络：神怎样用人、用地、用圣物完成拯救与同在。',
        },
        {
          id: 'p-moses',
          media: 'portrait',
          title: '摩西蒙召',
          entity_label: '摩西',
          relation: '蒙召前往法老',
          ref: 'EXO 3:10',
          narration: '神在荆棘火焰中呼召摩西，差他去见法老，领百姓出埃及。软弱也被纳入使命。',
          ask_seed: '摩西为何多次推辞？神如何回应他的软弱？',
        },
        {
          id: 'p-aaron',
          media: 'portrait',
          title: '亚伦同工',
          entity_label: '亚伦',
          relation: '作摩西的口',
          ref: 'EXO 4:14',
          narration: '亚伦作摩西的口，一同面对法老，也在敬拜中服事——使命常是配搭，不是独行。',
          ask_seed: '亚伦在出埃及故事里扮演哪些关键角色？',
        },
        {
          id: 'p-sea',
          media: 'portrait',
          title: '过红海',
          entity_label: '红海',
          relation: '拯救的记号',
          ref: 'EXO 14:29',
          narration: '神开路拯救，埃及军兵倾覆；百姓开始学习信靠与敬拜。',
          ask_seed: '红海事件如何塑造以色列人对神的认识？',
        },
        {
          id: 'p-covenant',
          media: 'portrait',
          title: '西奈立约',
          entity_label: '西奈山',
          relation: '约与律法',
          ref: 'EXO 19:8',
          narration: '在西奈山颁布律法，百姓答应「凡耶和华所说的，我们都要遵行」。',
          ask_seed: '西奈之约怎样定义以色列与神的关系？',
        },
        {
          id: 'p-tabernacle',
          media: 'portrait',
          title: '会幕与约柜',
          entity_label: '会幕 · 约柜',
          relation: '神的同在',
          ref: 'EXO 25:8',
          narration: '神要住在百姓中间；约柜成为至圣所的中心，象征同在与约。',
          ask_seed: '会幕与约柜如何指向神愿意与人同住？',
        },
        {
          id: 'p-quote',
          media: 'quote',
          title: '串起来看',
          narration: '从哀声到过海，从立约到会幕：神拯救一群人，也为要住在他们中间。',
        },
        {
          id: 'p-fin',
          media: 'fin',
          fin_kind: 'series',
          title: '出埃及故事 · 已走完',
          narration: '从哀声到立约，神要住在百姓中间——敬拜由此开始。',
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
