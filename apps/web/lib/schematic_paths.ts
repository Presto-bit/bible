/** §19.14.12/13 · 示意路径图布局（非精确地理） */

export type SchematicLayoutId =
  | 'exodus-wilderness'
  | 'paul-first-journey'
  | 'jesus-ministry-galilee';

export type SchematicStopLayout = {
  placeId: string;
  /** viewBox 380×200 内坐标 */
  x: number;
  y: number;
};

export type SchematicPathDef = {
  id: SchematicLayoutId;
  viewBox: string;
  sea: string;
  land: string[];
  /** 默认折线；运行时仍按 stops 顺序重连 */
  routeHint?: string;
  stops: SchematicStopLayout[];
  /** 可选 vignette：public 路径，按 place_id */
  vignettes?: Record<string, string>;
  /** 短 happen（图下讲解）；缺省用 tour.note */
  happenByPlaceId?: Record<string, string>;
  chipsByPlaceId?: Record<string, string[]>;
};

export const SCHEMATIC_PATHS: Record<SchematicLayoutId, SchematicPathDef> = {
  'exodus-wilderness': {
    id: 'exodus-wilderness',
    viewBox: '0 0 380 200',
    sea: 'M210 28 H360 V175 H210 Z',
    land: [
      'M18 36 C70 28 130 48 195 72 L205 175 L28 175 Z',
      'M195 72 C230 88 255 110 268 145 L205 175 Z',
    ],
    stops: [
      { placeId: 'egypt', x: 52, y: 88 },
      { placeId: 'red-sea', x: 118, y: 105 },
      { placeId: 'marah', x: 168, y: 118 },
      { placeId: 'elim', x: 210, y: 128 },
      { placeId: 'rephidim', x: 258, y: 142 },
      { placeId: 'mount-sinai', x: 308, y: 155 },
    ],
    vignettes: {
      egypt: '/knowledge/vignettes/wilderness/egypt.png',
      'red-sea': '/knowledge/vignettes/wilderness/01_red_sea.png',
      marah: '/knowledge/vignettes/wilderness/02_marah.png',
      elim: '/knowledge/vignettes/wilderness/03_elim.png',
      rephidim: '/knowledge/vignettes/wilderness/05_rephidim.png',
      'mount-sinai': '/knowledge/vignettes/wilderness/06_sinai.png',
    },
    happenByPlaceId: {
      egypt: '百姓在苦役中，行程将启',
      'red-sea': '水分开，百姓走干地',
      marah: '苦水变甜',
      elim: '十二泉七十棕树歇息',
      rephidim: '击打磐石水流出',
      'mount-sinai': '在西奈山下安营',
    },
    chipsByPlaceId: {
      egypt: ['为奴', '起行'],
      'red-sea': ['水墙', '干地'],
      marah: ['苦泉', '变甜'],
      elim: ['棕树', '泉源'],
      rephidim: ['磐石', '出水'],
      'mount-sinai': ['山下', '安营'],
    },
  },
  'paul-first-journey': {
    id: 'paul-first-journey',
    viewBox: '0 0 380 200',
    sea: 'M24 48 H356 V168 H24 Z',
    land: [
      /* 小亚细亚南岸 */
      'M40 55 C110 42 180 48 235 58 L245 105 L55 112 Z',
      /* 塞浦路斯 */
      'M175 122 C195 112 225 112 245 122 C235 138 195 140 175 122 Z',
      /* 叙利亚沿岸 */
      'M268 68 C310 58 350 78 348 118 L290 128 Z',
    ],
    stops: [
      { placeId: 'antioch-syria', x: 318, y: 92 },
      { placeId: 'cyprus', x: 210, y: 128 },
      { placeId: 'antioch-pisidia', x: 155, y: 72 },
      { placeId: 'iconium', x: 138, y: 82 },
      { placeId: 'lystra', x: 122, y: 95 },
      { placeId: 'derbe', x: 108, y: 108 },
      // 回程再点安提阿：同一 placeId 会出现两次，布局用第一次坐标即可
    ],
    vignettes: {
      'antioch-syria': '/knowledge/vignettes/paul/01_antioch_send.png',
      cyprus: '/knowledge/vignettes/paul/02_cyprus.png',
      'antioch-pisidia': '/knowledge/vignettes/paul/03_pisidian_antioch.png',
      iconium: '/knowledge/vignettes/paul/05_iconium.png',
      lystra: '/knowledge/vignettes/paul/04_lystra.png',
      derbe: '/knowledge/vignettes/paul/06_derbe.png',
    },
    happenByPlaceId: {
      'antioch-syria': '禁食祷告按手差遣 / 回报开了信道的门',
      cyprus: '坐船往塞浦路斯传道',
      'antioch-pisidia': '安息日在会堂讲道',
      iconium: '犹太与希腊人中多人信主',
      lystra: '医治后被人当作神',
      derbe: '传福音、坚固门徒',
    },
    chipsByPlaceId: {
      'antioch-syria': ['差遣', '回报'],
      cyprus: ['海船', '会堂'],
      'antioch-pisidia': ['会堂', '讲道'],
      iconium: ['信主', '逼迫'],
      lystra: ['医治', '误会'],
      derbe: ['门徒', '回访'],
    },
  },
  'jesus-ministry-galilee': {
    id: 'jesus-ministry-galilee',
    viewBox: '0 0 380 200',
    /* 湖区在北，南下耶路撒冷：示意非精确地理 */
    sea: 'M168 42 C210 28 268 38 278 78 C270 108 220 118 178 108 C148 98 140 62 168 42 Z',
    land: [
      'M40 48 C95 38 140 55 165 78 L175 175 L48 175 Z',
      'M278 70 C320 55 350 78 348 120 L290 140 Z',
      'M175 120 C220 128 260 145 275 175 L175 175 Z',
    ],
    stops: [
      { placeId: 'nazareth', x: 118, y: 95 },
      { placeId: 'capernaum', x: 188, y: 72 },
      { placeId: 'sea-of-galilee', x: 218, y: 88 },
      { placeId: 'bethsaida', x: 248, y: 68 },
      { placeId: 'caesarea-philippi', x: 298, y: 48 },
      { placeId: 'mount-of-olives-2', x: 235, y: 148 },
      { placeId: 'jerusalem', x: 248, y: 168 },
    ],
    vignettes: {
      nazareth: '/knowledge/vignettes/galilee/01_nazareth.png',
      capernaum: '/knowledge/vignettes/galilee/02_capernaum.png',
      'sea-of-galilee': '/knowledge/vignettes/galilee/03_sea_of_galilee.png',
      bethsaida: '/knowledge/vignettes/galilee/04_bethsaida.png',
      'caesarea-philippi': '/knowledge/vignettes/galilee/05_caesarea_philippi.png',
      'mount-of-olives-2': '/knowledge/vignettes/galilee/06_olives.png',
      jerusalem: '/knowledge/vignettes/galilee/07_jerusalem.png',
    },
    happenByPlaceId: {
      nazareth: '家乡会堂宣告恩年',
      capernaum: '以湖城为事工中心',
      'sea-of-galilee': '海边呼召得人的渔夫',
      bethsaida: '五饼二鱼喂饱众人',
      'caesarea-philippi': '彼得认祂为基督',
      'mount-of-olives-2': '面向圣城讲论末后',
      jerusalem: '荣入圣城走向十架',
    },
    chipsByPlaceId: {
      nazareth: ['会堂', '被拒'],
      capernaum: ['教导', '医治'],
      'sea-of-galilee': ['呼召', '渔夫'],
      bethsaida: ['供应', '怜悯'],
      'caesarea-philippi': ['认信', '受难'],
      'mount-of-olives-2': ['儆醒', '末后'],
      jerusalem: ['入城', '受难'],
    },
  },
};

export function isSchematicTour(id: string): id is SchematicLayoutId {
  return (
    id === 'exodus-wilderness' ||
    id === 'paul-first-journey' ||
    id === 'jesus-ministry-galilee'
  );
}
