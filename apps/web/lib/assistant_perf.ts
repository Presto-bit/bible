import { hasVisibleAnswerContent } from '@/lib/assistant_visible';
import { API_BASE, authHeaders } from '@/lib/api';
import { getDeviceId } from '@/lib/device_id';
import { recordPerf } from '@/lib/perf_rum';

export type AssistantPerfDetail = {
  surface?: string;
  scene?: string;
  cacheHit?: boolean;
  cacheSource?: string;
};

type SessionMark = {
  name: string;
  ms: number;
  detail?: Record<string, string | number | boolean | null | undefined>;
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
  private readonly sessionMarks: SessionMark[] = [];

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
      this.recordSession('assistant.prepare', serverPrepare, {
        cacheHit: meta?.cache_hit,
        cacheSource: meta?.cache_source,
        source: 'server',
      });
    } else if (this.tPlaceholderMeta != null && this.tFullMeta != null) {
      this.recordSession('assistant.prepare', this.tFullMeta - this.tPlaceholderMeta, {
        cacheHit: meta?.cache_hit,
        cacheSource: meta?.cache_source,
        source: 'client',
      });
    }
    if (meta?.cache_hit) {
      this.recordSession('assistant.cache_hit', this.now() - this.t0, {
        cacheSource: meta.cache_source,
      });
    }
  }

  onFirstToken(): void {
    if (this.tFirstToken != null) return;
    this.tFirstToken = this.now();
    this.recordSession('assistant.first_token', this.tFirstToken - this.t0);
  }

  onTextUpdate(text: string): void {
    if (this.tVisible != null) return;
    if (!hasVisibleAnswerContent(text)) return;
    this.tVisible = this.now();
    this.recordSession('assistant.visible', this.tVisible - this.t0);
  }

  onDone(): void {
    if (this.finished) return;
    this.finished = true;
    const doneAt = this.now();
    this.recordSession('assistant.done', doneAt - this.t0);
    if (this.tFirstToken != null) {
      this.recordSession('assistant.stream_body', doneAt - this.tFirstToken);
    }
    void flushAssistantPerf(this.sessionMarks);
  }

  onError(): void {
    if (this.finished) return;
    this.finished = true;
    this.recordSession('assistant.error', this.now() - this.t0);
    void flushAssistantPerf(this.sessionMarks);
  }

  private recordSession(
    name: string,
    ms: number,
    extra?: SessionMark['detail'],
  ): void {
    recordPerf(name, ms, { ...this.detail, ...extra });
    if (!Number.isFinite(ms) || ms < 0) return;
    this.sessionMarks.push({
      name,
      ms: Math.round(ms),
      detail: { ...this.detail, ...extra },
    });
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }
}

/** 将本轮小爱 RUM 打点 batch 上报服务端（fail-open）。 */
export async function flushAssistantPerf(marks: SessionMark[]): Promise<void> {
  if (typeof window === 'undefined' || !marks.length) return;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders(),
  };
  const deviceId = getDeviceId();
  if (deviceId) headers['X-Guest-Id'] = deviceId;
  try {
    await fetch(`${API_BASE}/ai/perf`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ marks: marks.slice(-12) }),
      keepalive: true,
    });
  } catch {
    /* fail-open */
  }
}
