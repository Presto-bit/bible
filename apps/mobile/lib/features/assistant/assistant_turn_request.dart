/// 小爱统一输入契约 TurnRequest（P2，对齐 Web `assistant_turn_request.ts`）。
library;

import 'assistant_scenes.dart';

typedef TurnSurface = String;

abstract final class TurnSurfaces {
  static const halfSheet = 'half_sheet';
  static const assistant = 'assistant';
  static const homePrefill = 'home_prefill';
  static const prewarm = 'prewarm';
}

class TurnHistoryMessage {
  const TurnHistoryMessage({required this.role, required this.content});
  final String role;
  final String content;

  Map<String, dynamic> toJson() => {'role': role, 'content': content};
}

class TurnRequest {
  const TurnRequest({
    this.anchorRef,
    this.question = '',
    this.scene,
    this.mode,
    required this.surface,
    this.history = const [],
    this.readerContext,
    this.knowledgeBaseId,
    this.conversationId,
    this.clientCapabilities,
  });

  final String? anchorRef;
  final String question;
  final AssistantScene? scene;
  final String? mode;
  final String surface;
  final List<TurnHistoryMessage> history;
  final Map<String, dynamic>? readerContext;
  final String? knowledgeBaseId;
  final String? conversationId;
  final Map<String, dynamic>? clientCapabilities;
}

class ResolvedTurnRequest extends TurnRequest {
  const ResolvedTurnRequest({
    super.anchorRef,
    required super.question,
    required this.refForApi,
    required this.scene,
    required this.mode,
    required super.surface,
    super.history,
    super.readerContext,
    super.knowledgeBaseId,
    super.conversationId,
    super.clientCapabilities,
  });

  final String? refForApi;
  @override
  final AssistantScene scene;
  @override
  final String mode;
}

ResolvedTurnRequest resolveTurnRequest(TurnRequest req) {
  final resolved = resolveChatTurn(
    anchorRef: req.anchorRef,
    historyLength: req.history.length,
    explicitScene: req.scene,
    mode: req.mode,
  );
  final mode = req.mode ?? resolved.scene.mode;
  return ResolvedTurnRequest(
    anchorRef: req.anchorRef,
    question: req.question,
    refForApi: resolved.refForApi,
    scene: resolved.scene,
    mode: mode,
    surface: req.surface,
    history: req.history,
    readerContext: req.readerContext,
    knowledgeBaseId: req.knowledgeBaseId,
    conversationId: req.conversationId,
    clientCapabilities: req.clientCapabilities,
  );
}

Map<String, dynamic> toChatStreamBody(ResolvedTurnRequest req) {
  return {
    if (req.refForApi != null && req.refForApi!.isNotEmpty) 'ref': req.refForApi,
    'question': req.question,
    'mode': req.mode,
    'scene': req.scene.id,
    if (req.history.isNotEmpty)
      'history': req.history.map((h) => h.toJson()).toList(),
    'surface': req.surface,
    if (req.readerContext != null) 'reader_context': req.readerContext,
    if (req.knowledgeBaseId != null && req.knowledgeBaseId!.isNotEmpty)
      'knowledge_base_id': req.knowledgeBaseId,
    if (req.conversationId != null && req.conversationId!.isNotEmpty)
      'conversation_id': req.conversationId,
    'client_capabilities': req.clientCapabilities ??
        const {
          'schema_version': 3,
          'supports_section_stream': true,
        },
  };
}

ResolvedTurnRequest buildHalfSheetTurnRequest({
  required String ref,
  required String question,
  required AssistantScene scene,
  List<TurnHistoryMessage> history = const [],
  Map<String, dynamic>? readerContext,
  String? knowledgeBaseId,
  String? conversationId,
}) {
  return resolveTurnRequest(
    TurnRequest(
      anchorRef: ref,
      question: question,
      scene: scene,
      surface: TurnSurfaces.halfSheet,
      history: history,
      readerContext: readerContext,
      knowledgeBaseId: knowledgeBaseId,
      conversationId: conversationId,
    ),
  );
}

ResolvedTurnRequest buildAssistantTurnRequest({
  required String question,
  String? anchorRef,
  AssistantScene? scene,
  String? mode,
  List<TurnHistoryMessage> history = const [],
  Map<String, dynamic>? readerContext,
  String? knowledgeBaseId,
}) {
  return resolveTurnRequest(
    TurnRequest(
      anchorRef: anchorRef,
      question: question,
      scene: scene,
      mode: mode,
      surface: TurnSurfaces.assistant,
      history: history,
      readerContext: readerContext,
      knowledgeBaseId: knowledgeBaseId,
    );
  );
}
