// 阅读器界面文案：KJV 单栏时切换英文。

export type ReaderUiCopy = {
  chapter: string;
  selectHint: string;
  loading: string;
  settings: string;
  pickVersion: string;
  versionHint: string;
  versionDownloaded: string;
  versionAvailable: string;
  versionDownload: string;
  versionDownloading: string;
  versionRetry: string;
  versionUnavailable: string;
  mainText: string;
  compareText: string;
  singleLayout: string;
  parallelLayout: string;
  fontSize: string;
  theme: string;
  verseNo: string;
  askAi: string;
  explain: string;
  copy: string;
  note: string;
};

const ZH: ReaderUiCopy = {
  chapter: '章',
  selectHint: '长按拖选；双击选中整节',
  loading: '加载中…',
  settings: '阅读设置',
  pickVersion: '选择版本',
  versionHint: '最多勾选 2 本；先勾选的显示在上，后勾选的为对照',
  versionDownloaded: '已下载',
  versionAvailable: '可用',
  versionDownload: '下载',
  versionDownloading: '下载中…',
  versionRetry: '重试',
  versionUnavailable: '暂不可用',
  mainText: '正文',
  compareText: '对照',
  singleLayout: '单栏',
  parallelLayout: '译本对照',
  fontSize: '字号',
  theme: '纸张主题',
  verseNo: '节号显示',
  askAi: '解释',
  explain: '解释',
  copy: '复制',
  note: '笔记',
};

const EN: ReaderUiCopy = {
  chapter: '',
  selectHint: 'Long-press to drag-select; double-click a verse',
  loading: 'Loading…',
  settings: 'Reading settings',
  pickVersion: 'Select version',
  versionHint: 'Select up to 2 versions; first selected shows on top',
  versionDownloaded: 'Downloaded',
  versionAvailable: 'Available',
  versionDownload: 'Download',
  versionDownloading: 'Downloading…',
  versionRetry: 'Retry',
  versionUnavailable: 'Unavailable',
  mainText: 'Primary',
  compareText: 'Compare',
  singleLayout: 'Single column',
  parallelLayout: 'Compare',
  fontSize: 'Font size',
  theme: 'Theme',
  verseNo: 'Verse numbers',
  askAi: 'Explain',
  explain: 'Explain',
  copy: 'Copy',
  note: 'Note',
};

export type CatalogUiCopy = {
  title: string;
  resume: string;
  resumeSub: string;
  startJohn: string;
  startHint: string;
  booksTab: string;
  chaptersTab: string;
  ot: string;
  nt: string;
  chaptersUnit: string;
  chaptersTotal: string;
  switchBook: string;
  planMode: string;
  planOnly: string;
  planWarnChapter: string;
  planWarnBook: string;
};

const CATALOG_ZH: CatalogUiCopy = {
  title: '圣经目录',
  resume: '继续',
  resumeSub: '从上次读到的地方继续',
  startJohn: '从约翰福音开始',
  startHint: '新手友好 · 也可在下方自由选卷',
  booksTab: '分卷',
  chaptersTab: '章节',
  ot: '旧约',
  nt: '新约',
  chaptersUnit: '章',
  chaptersTotal: '共',
  switchBook: '换卷 ›',
  planMode: ' · 计划模式',
  planOnly: '仅显示今日计划经卷与章节',
  planWarnChapter: '该章节不在今日计划内，请从计划段列表选择',
  planWarnBook: '该经卷不在今日计划内',
};

const CATALOG_EN: CatalogUiCopy = {
  title: 'Bible',
  resume: 'Continue',
  resumeSub: 'Pick up where you left off',
  startJohn: 'Start with John',
  startHint: 'A gentle entry · or choose any book below',
  booksTab: 'Books',
  chaptersTab: 'Chapters',
  ot: 'Old Testament',
  nt: 'New Testament',
  chaptersUnit: ' ch',
  chaptersTotal: '',
  switchBook: 'All books ›',
  planMode: ' · Plan',
  planOnly: 'Showing today’s plan books and chapters only',
  planWarnChapter: 'This chapter is not in today’s plan',
  planWarnBook: 'This book is not in today’s plan',
};

export function catalogUi(english?: boolean): CatalogUiCopy {
  return english ? CATALOG_EN : CATALOG_ZH;
}

export function readerUi(english?: boolean): ReaderUiCopy {
  return english ? EN : ZH;
}
