/// 小爱（AI 释经）模型。
library;

import 'assistant_answer_document.dart';
import 'assistant_blocks.dart';
import 'assistant_output_plan.dart';
import 'assistant_section_stream.dart';
import 'assistant_sections.dart';

/// 六种模式（与后端 ai/prompts MODES 对齐）。
enum AssistantMode {
  understand('understand', '读懂经文'),
  explain('explain', '释经解释'),
  apply('apply', '默想应用'),
  compare('compare', '译本对照'),
  original('original', '原文释义'),
  preach('preach', '讲道大纲');

  const AssistantMode(this.id, this.label);
  final String id;
  final String label;

  static AssistantMode? fromId(String id) {
    for (final m in AssistantMode.values) {
      if (m.id == id) return m;
    }
    return null;
  }
}

/// 引用脚注。
class Citation {
  Citation({
    required this.n,
    required this.title,
    required this.score,
    this.snippet,
    this.documentId,
  });
  final int n;
  final String title;
  final double score;
  final String? snippet;
  final String? documentId;

  factory Citation.fromJson(Map<String, dynamic> j) => Citation(
        n: (j['n'] ?? 0) as int,
        title: (j['title'] ?? '') as String,
        score: ((j['score'] ?? 0) as num).toDouble(),
        snippet: j['snippet'] as String?,
        documentId: j['document_id'] as String?,
      );
}

/// meta 事件载荷。
class ChatMeta {
  ChatMeta({
    required this.mode,
    required this.modeLabel,
    required this.display,
    required this.citations,
    required this.quotaUsed,
    required this.quotaLimit,
    this.scene,
    this.sceneLabel,
    this.useRag,
    this.knowledgeBaseId,
    this.knowledgeBaseName,
    this.citationsPending = false,
    this.responseProfile,
    this.structureAssets = const [],
    this.outputPlan,
    this.conversationId,
    this.cacheHit,
    this.cacheSource,
    this.instant,
    this.timings,
  });

  final String mode;
  final String modeLabel;
  final String display;
  final List<Citation> citations;
  final int quotaUsed;
  final int quotaLimit;
  final String? scene;
  final String? sceneLabel;
  final bool? useRag;
  final String? knowledgeBaseId;
  final String? knowledgeBaseName;
  final bool citationsPending;
  final String? responseProfile;
  final List<StructureAsset> structureAssets;
  final OutputPlan? outputPlan;
  final String? conversationId;
  final bool? cacheHit;
  final String? cacheSource;
  final bool? instant;
  final Map<String, int>? timings;

  factory ChatMeta.fromJson(Map<String, dynamic> j) {
    final q = (j['quota'] ?? const {}) as Map<String, dynamic>;
    return ChatMeta(
      mode: (j['mode'] ?? '') as String,
      modeLabel: (j['mode_label'] ?? '') as String,
      display: (j['display'] ?? '') as String,
      scene: j['scene'] as String?,
      sceneLabel: j['scene_label'] as String?,
      useRag: j['use_rag'] is bool ? j['use_rag'] as bool : null,
      knowledgeBaseId: j['knowledge_base_id'] as String?,
      knowledgeBaseName: j['knowledge_base_name'] as String?,
      citations: ((j['citations'] ?? []) as List)
          .map((e) => Citation.fromJson(e as Map<String, dynamic>))
          .toList(),
      quotaUsed: (q['used'] ?? 0) as int,
      quotaLimit: (q['limit'] ?? 0) as int,
      citationsPending: j['citations_pending'] == true,
      responseProfile: j['response_profile'] as String?,
      structureAssets: ((j['structure_assets'] ?? []) as List)
          .map((e) => StructureAsset.fromJson(e as Map<String, dynamic>))
          .toList(),
      outputPlan: j['output_plan'] is Map<String, dynamic>
          ? OutputPlan.fromJson(j['output_plan'] as Map<String, dynamic>)
          : null,
      conversationId: j['conversation_id'] as String?,
      cacheHit: j['cache_hit'] is bool ? j['cache_hit'] as bool : null,
      cacheSource: j['cache_source'] as String?,
      instant: j['instant'] is bool ? j['instant'] as bool : null,
      timings: _parseTimings(j['timings']),
    );
  }
}

Map<String, int>? _parseTimings(dynamic raw) {
  if (raw is! Map) return null;
  final out = <String, int>{};
  for (final entry in raw.entries) {
    final v = entry.value;
    if (v is num) out[entry.key.toString()] = v.toInt();
  }
  return out.isEmpty ? null : out;
}

/// 流式事件（meta / delta / followups / done / error）。
sealed class ChatEvent {
  const ChatEvent();
}

class MetaEvent extends ChatEvent {
  const MetaEvent(this.meta);
  final ChatMeta meta;
}

class DeltaEvent extends ChatEvent {
  const DeltaEvent(this.text);
  final String text;
}

class FollowupsEvent extends ChatEvent {
  const FollowupsEvent(this.items);
  final List<String> items;
}

class SectionStartEvent extends ChatEvent {
  const SectionStartEvent({required this.id, required this.title});
  final String id;
  final String title;
}

class SectionDeltaEvent extends ChatEvent {
  const SectionDeltaEvent({required this.id, required this.text});
  final String id;
  final String text;
}

class SectionDoneEvent extends ChatEvent {
  const SectionDoneEvent({
    required this.id,
    required this.title,
    required this.text,
  });
  final String id;
  final String title;
  final String text;
}

class DoneEvent extends ChatEvent {
  const DoneEvent({
    this.length = 0,
    this.text = '',
    this.followups = const [],
    this.sections = const [],
    this.document,
    this.conversationId,
    this.streamComplete = true,
  });
  final int length;
  final String text;
  final List<String> followups;
  final List<AnswerSection> sections;
  final AnswerDocument? document;
  final String? conversationId;
  final bool streamComplete;
}

class ErrorEvent extends ChatEvent {
  const ErrorEvent(this.message);
  final String message;
}

/// 一轮对话（本地持有，用于多轮 history 与 UI 渲染）。
class ChatTurn {
  ChatTurn({
    required this.role,
    required this.content,
    this.meta,
    this.followups = const [],
    this.scene,
    this.sceneLabel,
    this.sections = const [],
    this.streamSections = const [],
    this.structureAssets = const [],
  });
  final String role; // user / assistant
  String content;
  ChatMeta? meta;
  List<String> followups;
  String? scene;
  String? sceneLabel;
  List<AnswerSection> sections;
  List<StreamSection> streamSections;
  List<StructureAsset> structureAssets;
}
