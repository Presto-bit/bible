/// 小爱仓库：POST /ai/chat 的 SSE 流式解析。
///
/// 返回 `Stream<ChatEvent>`；429 限额转成 `ErrorEvent`。
library;

import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'assistant_answer_document.dart';
import 'assistant_format.dart';
import 'assistant_turn_request.dart';
import 'models.dart';

class AiQuota {
  const AiQuota({
    required this.used,
    required this.limit,
    this.unlimited = false,
  });
  final int used;
  final int limit;
  final bool unlimited;

  factory AiQuota.fromJson(Map<String, dynamic> j) => AiQuota(
    used: (j['used'] ?? 0) as int,
    limit: (j['limit'] ?? 0) as int,
    unlimited: j['unlimited'] == true,
  );
}

class AssistantRepository {
  AssistantRepository(this._dio);
  final Dio _dio;

  /// GET /ai/quota → { used, limit, unlimited? }
  Future<AiQuota?> fetchAiQuota() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/ai/quota');
      final data = res.data;
      if (data == null) return null;
      return AiQuota.fromJson(data);
    } catch (_) {
      return null;
    }
  }

  /// 半屏打开时预热 LLM 连接 + RAG 检索（非答案缓存）。
  Future<void> warmAi({String? ref, String? question}) async {
    try {
      final data = <String, dynamic>{};
      if (ref != null && ref.isNotEmpty) data['ref'] = ref;
      if (question != null && question.isNotEmpty) data['question'] = question;
      await _dio.post<void>('/ai/warm', data: data);
    } catch (_) {
      /* fail-open */
    }
  }

  /// 静默预热半屏 verse_full 答案（对齐 PWA prewarmAnswer）。
  Future<void> prewarmAnswer(
    String ref, {
    AssistantScene scene = AssistantScene.verseFull,
  }) async {
    try {
      await _dio.post<void>(
        '/ai/prewarm',
        data: {'ref': ref, 'scene': scene.id},
      );
    } catch (_) {
      /* fail-open */
    }
  }

  Stream<ChatEvent> chatFromTurn(
    ResolvedTurnRequest turn, {
    CancelToken? cancelToken,
  }) async* {
    final body = Map<String, dynamic>.from(toChatStreamBody(turn));
    if (turn.history.isNotEmpty) {
      body['history'] = turn.history.map((h) => h.toJson()).toList();
    }
    for (var attempt = 0; attempt < 2; attempt++) {
      var gotContent = false;
      var sawDone = false;
      var terminalError = false;
      var incompleteRetry = false;
      await for (final evt in _chatAttempt(body, turn.scene, cancelToken: cancelToken)) {
        if (_eventHasContent(evt)) gotContent = true;
        if (evt is DoneEvent) sawDone = true;
        if (evt is ErrorEvent) {
          if (evt.code == 'incomplete_answer' && attempt == 0) {
            incompleteRetry = true;
            terminalError = true;
            break;
          }
          terminalError = true;
        }
        yield evt;
      }
      if (incompleteRetry) {
        yield const StreamRetryEvent();
        await Future<void>.delayed(const Duration(milliseconds: 450));
        continue;
      }
      if (terminalError || sawDone) return;
      if (gotContent) {
        yield const DoneEvent(streamComplete: false);
        return;
      }
      yield const ErrorEvent('未收到回答内容，请重试');
      return;
    }
  }

  static bool _eventHasContent(ChatEvent evt) {
    switch (evt) {
      case DeltaEvent(:final text):
        return text.trim().isNotEmpty;
      case SectionDeltaEvent(:final text):
        return text.trim().isNotEmpty;
      case SectionDoneEvent(:final text):
        return text.trim().isNotEmpty;
      default:
        return false;
    }
  }

  Stream<ChatEvent> chat({
    String? ref,
    String? question,
    required AssistantMode mode,
    List<ChatTurn> history = const [],
    String? conversationId,
    AssistantScene? scene,
    String? knowledgeBaseId,
    Map<String, dynamic>? readerContext,
    String surface = 'mobile',
    CancelToken? cancelToken,
  }) async* {
    final turn = resolveTurnRequest(
      TurnRequest(
        anchorRef: ref,
        question: question ?? '',
        scene: scene,
        mode: mode.id,
        surface: surface,
        history: history
            .map(
              (t) => TurnHistoryMessage(
                role: t.role,
                content: t.role == 'assistant' ? bodyText(t.content) : t.content,
              ),
            )
            .toList(),
        readerContext: readerContext,
        knowledgeBaseId: knowledgeBaseId,
        conversationId: conversationId,
        clientCapabilities: const {
          'schema_version': 3,
          'supports_section_stream': true,
        },
      ),
    );
    yield* chatFromTurn(turn, cancelToken: cancelToken);
  }

  /// 单次 POST /ai/chat 并解析 SSE；网络/HTTP 错误在此 yield ErrorEvent。
  Stream<ChatEvent> _chatAttempt(
    Map<String, dynamic> body,
    AssistantScene resolved, {
    CancelToken? cancelToken,
  }) async* {
    final Response<ResponseBody> res;
    try {
      res = await _dio.post<ResponseBody>(
        '/ai/chat',
        data: body,
        cancelToken: cancelToken,
        options: Options(
          responseType: ResponseType.stream,
          headers: {'Accept': 'text/event-stream'},
          receiveTimeout: Duration(milliseconds: resolved.timeoutMs + 35000),
          sendTimeout: const Duration(seconds: 30),
          validateStatus: (s) => s != null && s < 500,
        ),
      );
    } on DioException catch (e) {
      if (e.type == DioExceptionType.cancel) return;
      yield ErrorEvent('网络异常：${e.message ?? e.type.name}');
      return;
    }

    if (res.statusCode == 429) {
      yield const ErrorEvent('今日免费次数已用完，登录后可继续使用');
      return;
    }
    if (res.statusCode != 200 || res.data == null) {
      yield ErrorEvent('请求失败（${res.statusCode}）');
      return;
    }

    var buffer = '';
    try {
      await for (final chunk in res.data!.stream) {
        buffer += utf8.decode(chunk, allowMalformed: true);
        while (true) {
          final sep = buffer.indexOf('\n\n');
          if (sep < 0) break;
          final raw = buffer.substring(0, sep);
          buffer = buffer.substring(sep + 2);
          final evt = _parseFrame(raw);
          if (evt != null) yield evt;
        }
      }
    } on DioException catch (e) {
      if (e.type == DioExceptionType.cancel) return;
      // SSE 正常结束后连接关闭可能抛错；已有正文则 fail-open
      return;
    }
    if (buffer.trim().isNotEmpty) {
      final evt = _parseFrame(buffer.trim());
      if (evt != null) yield evt;
    }
  }

  ChatEvent? _parseFrame(String raw) {
    String? event;
    final dataLines = <String>[];
    for (final line in raw.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.add(line.substring(5).trim());
      }
    }
    if (event == null) return null;
    final dataStr = dataLines.join('\n');
    Map<String, dynamic> data = const {};
    if (dataStr.isNotEmpty) {
      try {
        data = jsonDecode(dataStr) as Map<String, dynamic>;
      } catch (_) {
        data = const {};
      }
    }
    switch (event) {
      case 'meta':
        return MetaEvent(ChatMeta.fromJson(data));
      case 'delta':
        return DeltaEvent((data['text'] ?? '') as String);
      case 'followups':
        final items =
            (data['items'] as List?)
                ?.map((e) => e.toString())
                .where((s) => s.isNotEmpty)
                .toList() ??
            const <String>[];
        return FollowupsEvent(items);
      case 'section_start':
        return SectionStartEvent(
          id: (data['id'] ?? '') as String,
          title: (data['title'] ?? '') as String,
        );
      case 'section_delta':
        return SectionDeltaEvent(
          id: (data['id'] ?? '') as String,
          text: (data['text'] ?? '') as String,
        );
      case 'section_done':
        return SectionDoneEvent(
          id: (data['id'] ?? '') as String,
          title: (data['title'] ?? '') as String,
          text: (data['text'] ?? '') as String,
        );
      case 'done':
        final followups =
            (data['followups'] as List?)
                ?.map((e) => e.toString())
                .where((s) => s.isNotEmpty)
                .toList() ??
            const <String>[];
        final sections =
            (data['sections'] as List?)
                ?.map((e) => AnswerSection.fromJson(e as Map<String, dynamic>))
                .toList() ??
            const <AnswerSection>[];
        final documentRaw = data['document'];
        final document = documentRaw is Map<String, dynamic>
            ? AnswerDocument.fromJson(documentRaw)
            : null;
        return DoneEvent(
          length: (data['length'] ?? 0) as int,
          text: (data['text'] ?? '') as String,
          followups: followups,
          sections: sections,
          document: document,
          conversationId: data['conversation_id'] as String?,
          streamComplete: data['streamComplete'] != false,
        );
      case 'error':
        return ErrorEvent(
          (data['message'] ?? '小爱暂时无法回应') as String,
          code: data['code'] as String?,
        );
      default:
        return null;
    }
  }

  Future<List<KnowledgeBaseSummary>> listKnowledgeBases() async {
    final res = await _dio.get<Map<String, dynamic>>('/ai/knowledge-bases');
    final items = (res.data?['items'] as List?) ?? const [];
    return items
        .map((e) => KnowledgeBaseSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Map<String, dynamic>> browseKnowledgeBases() async {
    final res = await _dio.get<Map<String, dynamic>>('/ai/knowledge-bases');
    return res.data ?? const {};
  }

  Future<Map<String, dynamic>> getKnowledgeBase(
    String id, {
    String? group,
  }) async {
    final q = group != null && group.isNotEmpty ? '?group=$group' : '';
    final res = await _dio.get<Map<String, dynamic>>(
      '/ai/knowledge-bases/$id$q',
    );
    return res.data ?? const {};
  }

  Future<Map<String, dynamic>> previewKnowledgeDocument(
    String documentId,
  ) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/ai/knowledge-bases/documents/$documentId',
    );
    return res.data ?? const {};
  }

  Future<CitationExplain> explainCitation({
    required String snippet,
    String? title,
    bool force = false,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/ai/citations/explain',
      data: {
        'snippet': snippet,
        if (title != null && title.isNotEmpty) 'title': title,
        if (force) 'force': true,
      },
    );
    return CitationExplain.fromJson(res.data ?? const {});
  }

  /// POST /ai/analysis-share → { id, path, lead, ref_label }
  Future<String?> createAnalysisShareSnapshot({
    required String answerMarkdown,
    String? refLabel,
    String? refParam,
    String? lead,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/ai/analysis-share',
        data: {
          'answer_markdown': answerMarkdown,
          if (refLabel != null && refLabel.isNotEmpty) 'ref_label': refLabel,
          if (refParam != null && refParam.isNotEmpty) 'ref_param': refParam,
          if (lead != null && lead.isNotEmpty) 'lead': lead,
        },
      );
      final id = res.data?['id'] as String?;
      if (id == null || id.isEmpty) return null;
      return id;
    } catch (_) {
      return null;
    }
  }
}

class KnowledgeBaseSummary {
  KnowledgeBaseSummary({
    required this.id,
    required this.name,
    required this.description,
    required this.isDefault,
    required this.kind,
  });
  final String id;
  final String name;
  final String description;
  final bool isDefault;
  final String kind;

  factory KnowledgeBaseSummary.fromJson(Map<String, dynamic> j) =>
      KnowledgeBaseSummary(
        id: (j['id'] ?? '') as String,
        name: (j['name'] ?? '') as String,
        description: (j['description'] ?? '') as String,
        isDefault: j['is_default'] == true,
        kind: (j['kind'] ?? '') as String,
      );
}

class CitationExplain {
  CitationExplain({
    required this.title,
    required this.explainZh,
    required this.snippet,
    required this.disclaimer,
    this.error,
  });
  final String title;
  final String explainZh;
  final String snippet;
  final String disclaimer;
  final String? error;

  factory CitationExplain.fromJson(Map<String, dynamic> j) => CitationExplain(
    title: (j['title'] ?? '') as String,
    explainZh: (j['explain_zh'] ?? '') as String,
    snippet: (j['snippet'] ?? '') as String,
    disclaimer:
        (j['disclaimer'] ?? '以下中文为便于阅读的释义，非官方译本；请以圣经与原文摘录为准。') as String,
    error: j['error'] as String?,
  );
}

final assistantRepoProvider = Provider<AssistantRepository>(
  (ref) => AssistantRepository(ref.watch(dioProvider)),
);
