/** 数据来源与许可（设置页展示；离线可用）。 */

export type AttributionItem = {
  id: string;
  name: string;
  license: string;
  url?: string;
  note?: string;
};

export type AttributionSection = {
  id: string;
  title: string;
  intro?: string;
  items: AttributionItem[];
};

export const CONTENT_ATTRIBUTION_SECTIONS: AttributionSection[] = [
  {
    id: 'bible',
    title: '圣经译本',
    intro: '经文正文版权归各译本权利人所有；本应用仅在获授权或许可范围内提供阅读与检索。',
    items: [
      {
        id: 'cnv',
        name: '圣经新译本（CNV）',
        license: '需授权',
        url: 'https://www.worldwidebiblesociety.org',
        note: '主译本；离线经库含全文。使用前须取得环球圣经公会等权利人的书面许可。',
      },
      {
        id: 'cuvs',
        name: '和合本（CUVS）',
        license: '待核实',
        url: 'https://github.com/midvash/bible-data',
        note: '数据来自 midvash/bible-data（标注 Public Domain）；现代和合本在部分地区仍可能有版权限制，商用前请法务确认。',
      },
      {
        id: 'kjv',
        name: 'King James Version（KJV）',
        license: 'Public Domain',
        url: 'https://github.com/scrollmapper/bible_databases',
        note: '经文来自 scrollmapper/bible_databases（KJV.json，1769 公版）；离线经库与对照阅读使用此来源。',
      },
    ],
  },
  {
    id: 'datasets',
    title: '开源与署名数据集',
    intro: '下列资料在应用中提供串珠、原文、地理与词典等功能；使用须保留署名，CC-BY-SA 资料再分发时须遵守相同方式共享。',
    items: [
      {
        id: 'openbible-crossrefs',
        name: 'OpenBible.info 串珠',
        license: 'CC-BY',
        url: 'https://www.openbible.info/labs/cross-references/',
      },
      {
        id: 'stepbible-strongs',
        name: 'STEPBible.org（Strong\'s / 逐词）',
        license: 'CC-BY',
        url: 'https://www.stepbible.org',
      },
      {
        id: 'gnosis',
        name: 'Gnosis Biblical Knowledge Graph',
        license: 'CC-BY-SA',
        url: 'https://github.com/spearssoftware/gnosis',
        note: '地理、时间线、部分词典词条。',
      },
      {
        id: 'helloao-commentary',
        name: 'HelloAO 公版英文注释',
        license: 'Public Domain',
        url: 'https://bible.helloao.org',
        note: '马太亨利、JFB 等；用于 AI 释经检索，不直接全文展示。',
      },
      {
        id: 'ocd',
        name: 'OpenChristianData 公版资料',
        license: 'Public Domain',
        url: 'https://github.com/OpenChristianData/open-christian-data',
        note: 'Wesley、Calvin、Barnes 等英文注释与参考词典。',
      },
    ],
  },
  {
    id: 'original',
    title: '应用原创内容',
    items: [
      {
        id: 'plans',
        name: '读经计划、祷告计划',
        license: '应用原创',
        note: '经节坐标引用正典；正文由经库解析填充。',
      },
      {
        id: 'summaries',
        name: '书卷/章节摘要、主题索引',
        license: '应用原创',
        note: '自编概要文案；经节引用不复制译本全文。',
      },
      {
        id: 'illustrations',
        name: '主题插画',
        license: '应用原创',
        note: '矢量插画为本项目生成。',
      },
      {
        id: 'daily-wallpapers',
        name: '每日经文风景背景',
        license: 'Unsplash（已打包）',
        note: '31 张风景图随应用分发，用于每日经文卡片与全屏壁纸，支持离线缓存。',
      },
    ],
  },
  {
    id: 'ai',
    title: 'AI 助手',
    intro: '释经回答由大语言模型生成，并检索上述公版注释与自有资料；不构成神学权威解释。请勿要求模型大段复述受版权保护的译本全文。',
    items: [
      {
        id: 'llm',
        name: 'DeepSeek / 通义等模型服务',
        license: '服务条款',
        note: '须遵守各模型服务商的使用政策。',
      },
    ],
  },
];

export function licenseLabel(license: string): string {
  const map: Record<string, string> = {
    'CC-BY': 'CC BY 4.0',
    'CC-BY-SA': 'CC BY-SA 4.0',
    'Public Domain': '公有领域',
    '需授权': '需权利人授权',
    '待核实': '许可待核实',
    '应用原创': '应用原创',
    '服务条款': '第三方服务条款',
  };
  return map[license] ?? license;
}
