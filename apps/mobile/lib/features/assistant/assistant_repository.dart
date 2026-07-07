/// 小爱仓库：POST /ai/chat 的 SSE 流式解析。
///
/// 返回 `Stream<ChatEvent>`；429 限额转成 `ErrorEvent`。
library;

import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'assistant_scenes.dart';
import 'models.dart';

class AssistantRepository {
  AssistantRepository(this._dio);
  final Dio _dio;

  Stream<ChatEvent> chat({
    String? ref,
    String? question,
    required AssistantMode mode,
    List<ChatTurn> history = const [],
    String? conversationId,
    AssistantScene? scene,
  }) async* {
    final resolved = scene ?? resolveScene(mode: mode.id);
    final body = <String, dynamic>{
      'mode': mode.id,
      'scene': resolved.id,
      'surface': 'mobile',
    };
    if (ref != null && ref.isNotEmpty) body['ref'] = ref;
    if (question != null && question.isNotEmpty) body['question'] = question;
    if (conversationId != null) body['conversation_id'] = conversationId;
    if (history.isNotEmpty) {
      body['history'] = history
          .map((t) => {
                'role': t.role,
                'content': t.role == 'assistant'
                    ? t.content.replaceAll(
                        RegExp(
                            r'\n[ \t]*(?:###\s*相关追问|【相关追问】|\[相关追问\]|相关追问\s*[:：])[\s\S]*$'),
                        '',
                      )
                    : t.content,
              })
          .toList();
    }

    final Response<ResponseBody> res;
    try {
      res = await _dio.post<ResponseBody>(
        '/ai/chat',
        data: body,
        options: Options(
          responseType: ResponseType.stream,
          headers: {'Accept': 'text/event-stream'},
          validateStatus: (s) => s != null && s < 500,
        ),
      );
    } on DioException catch (e) {
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
        final items = (data['items'] as List?)
                ?.map((e) => e.toString())
                .where((s) => s.isNotEmpty)
                .toList() ??
            const <String>[];
        return FollowupsEvent(items);
      case 'done':
        final followups = (data['followups'] as List?)
                ?.map((e) => e.toString())
                .where((s) => s.isNotEmpty)
                .toList() ??
            const <String>[];
        return DoneEvent(
          length: (data['length'] ?? 0) as int,
          followups: followups,
        );
      case 'error':
        return ErrorEvent((data['message'] ?? '小爱暂时无法回应') as String);
      default:
        return null;
    }
  }
}

final assistantRepoProvider = Provider<AssistantRepository>(
  (ref) => AssistantRepository(ref.watch(dioProvider)),
);
