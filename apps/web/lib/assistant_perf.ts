import { hasVisibleAnswerContent } from '@/lib/assistant_visible';
import { recordPerf } from '@/lib/perf_rum';

export type AssistantPerfDetail = {
  surface?: string;
  scene?: string;
  cacheHit?: boolean;
  cacheSource?: string;
};

/** 小爱单次 SSE 流式关键路径耗时（客户端 RUM）。 */
export class AssistantStreamPerf {
  private readonly t0 =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  private tPlaceholderMeta?: number;
  private tFullMeta?: number;
  private tFirstToken?: number;
  private tVisible?: number;
  private finished = false;

  constructor(private readonly detail: AssistantPerfDetail = {}) {}

  onPlaceholderMeta(): void {
    if (this.tPlaceholderMeta == null) {
      this.tPlaceholderMeta = this.now();
    }
  }

  onFullMeta(meta?: {
    cache_hit?: boolean;
    cache_source?: string;
    timings?: { prepare_ms?: number };
  }): void {
    if (this.tFullMeta == null) {
      this.tFullMeta = this.now();
    }
    const serverPrepare = meta?.timings?.prepare_ms;
    if (typeof serverPrepare === 'number' && serverPrepare >= 0) {
      recordPerf('assistant.prepare', serverPrepare, {
        ...this.detail,
        cacheHit: meta?.cache_hit,
        cacheSource: meta?.cache_source,
        source: 'server',
      });
    } else if (this.tPlaceholderMeta != null && this.tFullMeta != null) {
      recordPerf('assistant.prepare', this.tFullMeta - this.tPlaceholderMeta, {
        ...this.detail,
        cacheHit: meta?.cache_hit,
        cacheSource: meta?.cache_source,
        source: 'client',
      });
    }
    if (meta?.cache_hit) {
      recordPerf('assistant.cache_hit', this.now() - this.t0, {
        ...this.detail,
        cacheSource: meta.cache_source,
      });
    }
  }

  onFirstToken(): void {
    if (this.tFirstToken != null) return;
    this.tFirstToken = this.now();
    recordPerf('assistant.first_token', this.tFirstToken - this.t0, this.detail);
  }

  onTextUpdate(text: string): void {
    if (this.tVisible != null) return;
    if (!hasVisibleAnswerContent(text)) return;
    this.tVisible = this.now();
    recordPerf('assistant.visible', this.tVisible - this.t0, this.detail);
  }

  onDone(): void {
    if (this.finished) return;
    this.finished = true;
    const doneAt = this.now();
    recordPerf('assistant.done', doneAt - this.t0, this.detail);
    if (this.tFirstToken != null) {
      recordPerf('assistant.stream_body', doneAt - this.tFirstToken, this.detail);
    }
  }

  onError(): void {
    this.finished = true;
    recordPerf('assistant.error', this.now() - this.t0, this.detail);
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }
}
