/** 预览 HTML 消毒：去掉脚本/事件/危险 URI，降低 Office→HTML XSS 风险。 */
export function sanitizePreviewHtml(html: string): string {
  if (typeof window === 'undefined' || !html) return '';
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc
      .querySelectorAll(
        'script,iframe,object,embed,link,meta,base,form,svg,math,template',
      )
      .forEach((el) => el.remove());
    doc.querySelectorAll('*').forEach((el) => {
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        const val = (attr.value || '').trim();
        if (name.startsWith('on') || name === 'style' || name === 'srcdoc') {
          el.removeAttribute(attr.name);
          continue;
        }
        if (
          (name === 'href' ||
            name === 'src' ||
            name === 'xlink:href' ||
            name === 'poster' ||
            name === 'action' ||
            name === 'formaction') &&
          /^\s*(javascript:|vbscript:|data:text\/html)/i.test(val)
        ) {
          el.removeAttribute(attr.name);
        }
      }
    });
    return doc.body.innerHTML;
  } catch {
    return '';
  }
}
