import { sectionSlug, type AnswerSection } from '@/lib/assistant_sections';

type SectionEntry = {
  id: string;
  title: string;
  text: string;
  finalized: boolean;
};

export type StreamSection = {
  id: string;
  title: string;
  text: string;
  finalized: boolean;
};

/** P4：消费 section_* SSE，按节累积 Markdown，避免流式结构跳变。 */
export class SectionStreamAccumulator {
  private entries = new Map<string, SectionEntry>();
  private order: string[] = [];
  private _active = false;

  get active(): boolean {
    return this._active;
  }

  seedFromPlan(titles: string[] | undefined): void {
    if (!titles?.length) return;
    for (const title of titles) {
      const id = sectionSlug(title);
      if (this.entries.has(id)) continue;
      this.entries.set(id, { id, title, text: '', finalized: false });
      this.order.push(id);
    }
  }

  onStart(payload: { id: string; title: string }): void {
    this._active = true;
    const id = payload.id?.trim() || sectionSlug(payload.title);
    const title = payload.title?.trim() || id;
    if (!this.entries.has(id)) {
      this.entries.set(id, { id, title, text: '', finalized: false });
      this.order.push(id);
      return;
    }
    const existing = this.entries.get(id)!;
    if (title && existing.title !== title) {
      existing.title = title;
    }
  }

  onDelta(payload: { id: string; text: string }): void {
    if (!payload.text) return;
    this._active = true;
    const id = payload.id?.trim();
    if (!id) return;
    let entry = this.entries.get(id);
    if (!entry) {
      entry = { id, title: id, text: '', finalized: false };
      this.entries.set(id, entry);
      this.order.push(id);
    }
    entry.text += payload.text;
  }

  onDone(payload: { id: string; title: string; text: string }): void {
    this._active = true;
    const id = payload.id?.trim() || sectionSlug(payload.title);
    const title = payload.title?.trim() || id;
    let entry = this.entries.get(id);
    if (!entry) {
      entry = { id, title, text: '', finalized: false };
      this.entries.set(id, entry);
      this.order.push(id);
    }
    entry.title = title;
    entry.text = payload.text ?? entry.text;
    entry.finalized = true;
  }

  toMarkdown(): string {
    const parts: string[] = [];
    for (const id of this.order) {
      const entry = this.entries.get(id);
      if (!entry) continue;
      if (!entry.text.trim() && entry.finalized) continue;
      parts.push(`### ${entry.title}\n${entry.text}`.trimEnd());
    }
    return parts.join('\n\n').trim();
  }

  getSections(): AnswerSection[] {
    return this.order
      .map((id) => this.entries.get(id))
      .filter((e): e is SectionEntry => Boolean(e))
      .map((e) => ({ id: e.id, title: e.title }));
  }

  getWrittenSectionIds(): Set<string> {
    const out = new Set<string>();
    for (const id of this.order) {
      const entry = this.entries.get(id);
      if (entry?.text.trim()) out.add(id);
    }
    return out;
  }

  /** 流式增量渲染：按 section 返回正文，已 finalize 的节不再重算。 */
  getRenderableSections(): Array<{
    id: string;
    title: string;
    text: string;
    finalized: boolean;
  }> {
    return this.order
      .map((id) => this.entries.get(id))
      .filter((e): e is SectionEntry => Boolean(e))
      .filter((e) => e.text.trim() || !e.finalized)
      .map((e) => ({
        id: e.id,
        title: e.title,
        text: e.text,
        finalized: e.finalized,
      }));
  }
}
