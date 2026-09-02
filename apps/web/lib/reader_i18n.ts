// 阅读器界面文案：KJV 单栏时切换英文。

export type ReaderUiCopy = {
  chapter: string;
  selectHint: string;
  loading: string;
  settings: string;
  pickVersion: string;
  versionHint: string;
  versionDownloaded: string;
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

export function readerUi(_english?: boolean): ReaderUiCopy {
  return ZH;
}
