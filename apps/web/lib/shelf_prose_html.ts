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

const DIALOGUE_SPEAKER_RE = /^(信徒|牧者)[：:]\s*(.*)$/s;

function enhanceDialogueParagraph(p: HTMLParagraphElement, doc: Document) {
  if (!p.classList.contains('shelf-dialogue')) return;
  const text = (p.textContent || '').replace(/\u00a0/g, ' ').trim();
  const match = text.match(DIALOGUE_SPEAKER_RE);
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

function enhanceDialogueQuestions(root: HTMLElement) {
  const paras = Array.from(root.querySelectorAll('p'));
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    if ((p.textContent || '').trim() !== '继续对话的问题') continue;
    p.className = 'shelf-dialogue-q-head';
    for (let j = i + 1; j < paras.length; j++) {
      const next = paras[j];
      if (!next.classList.contains('shelf-body')) break;
      next.className = 'shelf-dialogue-q';
    }
  }
}

function enhanceShelfDialogueHtml(root: HTMLElement, doc: Document) {
  root.querySelectorAll('p.shelf-dialogue').forEach((p) => {
    enhanceDialogueParagraph(p as HTMLParagraphElement, doc);
  });
  enhanceDialogueQuestions(root);
}

/** 段落锚点：竖滚续读比 scroll 比例更稳（对齐 API html_normalize） */
export function injectShelfParagraphAnchors(root: ParentNode) {
  let idx = 0;
  root.querySelectorAll('p.shelf-body, p.shelf-docx-p, p.shelf-dialogue').forEach((p) => {
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
