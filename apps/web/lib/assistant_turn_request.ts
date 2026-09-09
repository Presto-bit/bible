/**
 * 小爱统一输入契约 TurnRequest（P2）。
 * 半屏 / Tab / Chip / 预填 均经 resolveTurnRequest → toChatStreamBody。
 */
import type { ChatHistoryTurn, ChatReaderContext, ChatStreamBody } from '@/lib/api_core';
import {
  resolveChatTurn,
  SCENES,
  type AssistantScene,
} from '@/lib/assistant_scenes';

export type TurnSurface =
  | 'half_sheet'
  | 'assistant'
  | 'home_prefill'
  | 'prewarm';

export type ClientCapabilities = {
  schema_version?: number;
  supports_section_stream?: boolean;
};

export type TurnHistoryMessage = ChatHistoryTurn;

export type TurnRequest = {
  anchorRef?: string | null;
  selectionText?: string;
  question: string;
  displayQuestion?: string;
  scene?: AssistantScene | null;
  mode?: string;
  surface: TurnSurface;
  history?: TurnHistoryMessage[];
  readerContext?: ChatReaderContext;
  knowledgeBaseId?: string | null;
  conversationId?: string | null;
  clientCapabilities?: ClientCapabilities;
};

export type ResolvedTurnRequest = TurnRequest & {
  refForApi: string | null;
  scene: AssistantScene;
  mode: string;
};

/** 客户端 scene 建议 + ref 策略（服务端 meta 为权威）。 */
export function resolveTurnRequest(req: TurnRequest): ResolvedTurnRequest {
  const { refForApi, scene } = resolveChatTurn({
    anchorRef: req.anchorRef,
    historyLength: req.history?.length ?? 0,
    explicitScene: req.scene ?? undefined,
    mode: req.mode,
  });
  const mode = req.mode ?? SCENES[scene].mode;
  return { ...req, refForApi, scene, mode };
}

export function toChatStreamBody(req: ResolvedTurnRequest): ChatStreamBody {
  return {
    ref: req.refForApi ?? undefined,
    question: req.question,
    mode: req.mode,
    scene: req.scene,
    history: req.history,
    surface: req.surface,
    reader_context: req.readerContext,
    knowledge_base_id: req.knowledgeBaseId,
    conversation_id: req.conversationId ?? undefined,
    client_capabilities: req.clientCapabilities ?? {
      schema_version: 3,
      supports_section_stream: true,
    },
  };
}

/** 读经半屏一轮请求。 */
export function buildHalfSheetTurnRequest(opts: {
  ref: string;
  question: string;
  scene: AssistantScene;
  history?: TurnHistoryMessage[];
  readerContext?: ChatReaderContext;
  knowledgeBaseId?: string | null;
  conversationId?: string | null;
}): ResolvedTurnRequest {
  return resolveTurnRequest({
    anchorRef: opts.ref,
    question: opts.question,
    scene: opts.scene,
    surface: 'half_sheet',
    history: opts.history,
    readerContext: opts.readerContext,
    knowledgeBaseId: opts.knowledgeBaseId,
    conversationId: opts.conversationId,
  });
}

/** 小爱 Tab 一轮请求。 */
export function buildAssistantTurnRequest(opts: {
  question: string;
  anchorRef?: string | null;
  scene?: AssistantScene | null;
  mode?: string;
  history?: TurnHistoryMessage[];
  readerContext?: ChatReaderContext;
  knowledgeBaseId?: string | null;
  conversationId?: string | null;
}): ResolvedTurnRequest {
  return resolveTurnRequest({
    anchorRef: opts.anchorRef,
    question: opts.question,
    scene: opts.scene,
    mode: opts.mode,
    surface: 'assistant',
    history: opts.history,
    readerContext: opts.readerContext,
    knowledgeBaseId: opts.knowledgeBaseId,
    conversationId: opts.conversationId,
  });
}
