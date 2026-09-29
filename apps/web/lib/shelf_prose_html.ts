/** 书架正文 HTML：经文引用 linkify + 块级文本处理 */

import { splitInlineRefs } from './inline_ref';

const SKIP_TAGS = new Set([
  'A',
  'BUTTON',
  'SCRIPT',
  'STYLE',
  'CODE',
  'PRE',
  'TEXTAREA',
  'INPUT',
]);

const SECTION_KICKERS = new Set([
  '场景',
  '核心句',
  '一起阅读的经文',
  '继续对话的问题',
  '本章练习',
]);

const Q_BLOCK_HEADS = new Set(['继续对话的问题', '本章练习']);

const SPEAKER_RE = /^([\u4e00-\u9fff]{2,4})[：:]\s*(.+)$/s;
const PAREN_ASIDE_RE = /^（[^）]{1,120}）$/;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function linkifyPlainText(text: string): string {
  const parts = splitInlineRefs(text);
  return parts
    .map((p) => {
      if (p.kind === 'text') return escapeHtml(p.value);
      if (!p.osis) return escapeHtml(p.value);
      const osis = escapeHtml(p.osis);
      const label = escapeHtml(p.value);
      return `<button type="button" class="shelf-inline-ref" data-osis="${osis}" data-label="${label}">${label}</button>`;
    })
    .join('');
}

function walkTextNodes(root: HTMLElement, fn: (node: Text) => void) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const batch: Text[] = [];
  let n = walker.nextNode();
  while (n) {
    batch.push(n as Text);
    n = walker.nextNode();
  }
  batch.forEach(fn);
}

function plainOf(el: Element): string {
  return (el.textContent || '').replace(/\u00a0/g, ' ').trim();
}

function enhanceDialogueParagraph(p: HTMLParagraphElement, doc: Document) {
  if (!p.classList.contains('shelf-dialogue')) return;
  if (p.querySelector('.shelf-dialogue-speaker')) return;
  const text = plainOf(p);
  const match = text.match(SPEAKER_RE);
  if (!match) return;
  const [, speaker, body] = match;
  p.replaceChildren();
  const speakerEl = doc.createElement('span');
  speakerEl.className = 'shelf-dialogue-speaker';
  speakerEl.textContent = speaker;
  p.appendChild(speakerEl);
  p.appendChild(doc.createTextNode('：'));
  const bodyEl = doc.createElement('span');
  bodyEl.className = 'shelf-dialogue-text';
  bodyEl.textContent = body;
  p.appendChild(bodyEl);
}

function tagSemanticParagraphs(root: HTMLElement) {
  root.querySelectorAll('p').forEach((p) => {
    if (
      p.classList.contains('shelf-dialogue')
      || p.classList.contains('shelf-dialogue-q-head')
      || p.classList.contains('shelf-dialogue-q')
      || p.classList.contains('shelf-section-kicker')
      || p.classList.contains('shelf-verse-line')
      || p.classList.contains('shelf-aside')
    ) {
      return;
    }
    const text = plainOf(p);
    if (!text) return;
    if (Q_BLOCK_HEADS.has(text)) {
      p.className = 'shelf-dialogue-q-head';
      return;
    }
    if (SECTION_KICKERS.has(text)) {
      p.className = 'shelf-section-kicker';
      return;
    }
    if (PAREN_ASIDE_RE.test(text)) {
      p.className = 'shelf-aside';
      return;
    }
    if (SPEAKER_RE.test(text)) {
      p.classList.add('shelf-dialogue');
    }
  });
}

function enhanceBlockSections(root: HTMLElement) {
  const paras = Array.from(root.querySelectorAll('p'));
  let mode: 'q' | 'verse' | null = null;
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    const label = plainOf(p).replace(/\s+/g, '');
    if (Q_BLOCK_HEADS.has(label)) {
      p.className = 'shelf-dialogue-q-head';
      mode = 'q';
      continue;
    }
    if (label === '一起阅读的经文') {
      p.className = 'shelf-section-kicker';
      mode = 'verse';
      continue;
    }
    if (SECTION_KICKERS.has(label)) {
      p.className = 'shelf-section-kicker';
      mode = null;
      continue;
    }
    if (
      p.classList.contains('shelf-h1')
      || p.classList.contains('shelf-docx-h1')
      || p.classList.contains('shelf-docx-title')
    ) {
      mode = null;
      continue;
    }
    const text = plainOf(p);
    if (!text) continue;
    if (mode === 'verse') {
      p.className = 'shelf-verse-line';
      mode = null;
      continue;
    }
    if (mode === 'q') {
      if (SPEAKER_RE.test(text)) {
        mode = null;
        continue;
      }
      p.className = 'shelf-dialogue-q';
    }
  }
}

function enhanceShelfDialogueHtml(root: HTMLElement, doc: Document) {
  // Word 不换行连字符 → ASCII，便于范围解析
  walkTextNodes(root, (node) => {
    if (node.textContent && node.textContent.includes('\u2011')) {
      node.textContent = node.textContent.replace(/\u2011/g, '-');
    }
  });
  tagSemanticParagraphs(root);
  root.querySelectorAll('p.shelf-dialogue').forEach((p) => {
    enhanceDialogueParagraph(p as HTMLParagraphElement, doc);
  });
  enhanceBlockSections(root);
}

/** 段落锚点：竖滚续读比 scroll 比例更稳（对齐 API html_normalize） */
export function injectShelfParagraphAnchors(root: ParentNode) {
  let idx = 0;
  root.querySelectorAll(
    'p.shelf-body, p.shelf-docx-p, p.shelf-dialogue, p.shelf-aside, p.shelf-verse-line',
  ).forEach((p) => {
    if (p.hasAttribute('data-shelf-p')) return;
    p.setAttribute('data-shelf-p', String(idx));
    idx += 1;
  });
}

export function shelfParagraphIndexForRatio(html: string, ratio: number): number {
  if (typeof window === 'undefined' || !html.trim()) return 0;
  try {
    const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html');
    const root = doc.getElementById('r');
    if (!root) return 0;
    injectShelfParagraphAnchors(root);
    const plain = (root.textContent || '').replace(/\s+/g, ' ').trim();
    if (!plain.length) return 0;
    const charPos = Math.round(Math.min(1, Math.max(0, ratio)) * plain.length);
    let pick = 0;
    root.querySelectorAll('[data-shelf-p]').forEach((el) => {
      const pos = plain.indexOf((el.textContent || '').trim().slice(0, 8));
      const n = Number(el.getAttribute('data-shelf-p'));
      if (pos >= 0 && pos <= charPos && n >= pick) pick = n;
    });
    return pick;
  } catch {
    return 0;
  }
}

export function shelfRatioForParagraphIndex(html: string, paragraphIndex: number): number {
  if (typeof window === 'undefined' || !html.trim()) return 0;
  try {
    const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html');
    const root = doc.getElementById('r');
    if (!root) return 0;
    injectShelfParagraphAnchors(root);
    const plain = (root.textContent || '').replace(/\s+/g, ' ').trim();
    if (!plain.length) return 0;
    const el = root.querySelector(`[data-shelf-p="${paragraphIndex}"]`);
    if (!el) return 0;
    const needle = (el.textContent || '').trim().slice(0, 12);
    const pos = plain.indexOf(needle);
    return pos >= 0 ? pos / plain.length : 0;
  } catch {
    return 0;
  }
}

/** 将 HTML 字符串中的经文引用转为可点击按钮（客户端 DOM 处理） */
export function linkifyShelfProseHtml(html: string): string {
  if (!html || typeof window === 'undefined') return html;
  try {
    const doc = new DOMParser().parseFromString(`<div id="shelf-prose-root">${html}</div>`, 'text/html');
    const root = doc.getElementById('shelf-prose-root');
    if (!root) return html;

    enhanceShelfDialogueHtml(root, doc);
    injectShelfParagraphAnchors(root);

    walkTextNodes(root, (node) => {
      const parent = node.parentElement;
      if (!parent || SKIP_TAGS.has(parent.tagName)) return;
      if (parent.classList.contains('shelf-inline-ref')) return;
      const raw = node.textContent || '';
      if (!raw.trim()) return;
      const linked = linkifyPlainText(raw);
      if (linked === escapeHtml(raw)) return;
      const wrap = doc.createElement('span');
      wrap.innerHTML = linked;
      parent.replaceChild(wrap, node);
    });

    return root.innerHTML;
  } catch {
    return html;
  }
}
