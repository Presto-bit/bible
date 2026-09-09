/// 小爱单次 SSE 流式关键路径耗时（客户端 RUM，对齐 Web assistant_perf.ts）。
library;

import 'package:dio/dio.dart';

import 'assistant_visible.dart';

class AssistantPerfDetail {
  const AssistantPerfDetail({this.surface, this.scene});

  final String? surface;
  final String? scene;
}

class _SessionMark {
  _SessionMark(this.name, this.ms, this.detail);
  final String name;
  final int ms;
  final Map<String, Object?>? detail;
}

/// 小爱单次 SSE 流式关键路径耗时（客户端 RUM）。 */
class AssistantStreamPerf {
  AssistantStreamPerf([this.detail = const AssistantPerfDetail()]);

  final AssistantPerfDetail detail;
  final int _t0 = DateTime.now().millisecondsSinceEpoch;

  int? _tPlaceholderMeta;
  int? _tFullMeta;
  int? _tFirstToken;
  int? _tVisible;
  bool _finished = false;
  final List<_SessionMark> _sessionMarks = [];

  void onPlaceholderMeta() {
    _tPlaceholderMeta ??= _now();
  }

  void onFullMeta({
    bool? cacheHit,
    String? cacheSource,
    int? prepareMs,
  }) {
    _tFullMeta ??= _now();
    if (prepareMs != null && prepareMs >= 0) {
      _recordSession('assistant.prepare', prepareMs, {
        ..._detailMap,
        'cacheHit': cacheHit,
        'cacheSource': cacheSource,
        'source': 'server',
      });
    } else if (_tPlaceholderMeta != null && _tFullMeta != null) {
      _recordSession('assistant.prepare', _tFullMeta! - _tPlaceholderMeta!, {
        ..._detailMap,
        'cacheHit': cacheHit,
        'cacheSource': cacheSource,
        'source': 'client',
      });
    }
    if (cacheHit == true) {
      _recordSession('assistant.cache_hit', _now() - _t0, {
        ..._detailMap,
        'cacheSource': cacheSource,
      });
    }
  }

  void onFirstToken() {
    if (_tFirstToken != null) return;
    _tFirstToken = _now();
    _recordSession('assistant.first_token', _tFirstToken! - _t0, _detailMap);
  }

  void onTextUpdate(String text) {
    if (_tVisible != null) return;
    if (!hasVisibleAnswerContent(text)) return;
    _tVisible = _now();
    _recordSession('assistant.visible', _tVisible! - _t0, _detailMap);
  }

  void onDone() {
    if (_finished) return;
    _finished = true;
    final doneAt = _now();
    _recordSession('assistant.done', doneAt - _t0, _detailMap);
    if (_tFirstToken != null) {
      _recordSession('assistant.stream_body', doneAt - _tFirstToken!, _detailMap);
    }
  }

  void onError() {
    if (_finished) return;
    _finished = true;
    _recordSession('assistant.error', _now() - _t0, _detailMap);
  }

  /// 取出本轮打点并清空（用于上报后丢弃）。
  List<Map<String, Object?>> takeMarksForFlush() {
    final out = [
      for (final m in _sessionMarks)
        {
          'name': m.name,
          'ms': m.ms,
          if (m.detail != null && m.detail!.isNotEmpty) 'detail': m.detail,
        },
    ];
    _sessionMarks.clear();
    return out;
  }

  Map<String, Object?> get _detailMap => {
        if (detail.surface != null) 'surface': detail.surface,
        if (detail.scene != null) 'scene': detail.scene,
      };

  int _now() => DateTime.now().millisecondsSinceEpoch;

  void _recordSession(
    String name,
    int ms, [
    Map<String, Object?>? extra,
  ]) {
    if (ms < 0) return;
    _sessionMarks.add(_SessionMark(name, ms, extra));
  }
}

/// 将本轮小爱 RUM 打点 batch 上报服务端（fail-open）。
Future<void> flushAssistantPerf(Dio dio, AssistantStreamPerf perf) async {
  final marks = perf.takeMarksForFlush();
  if (marks.isEmpty) return;
  try {
    await dio.post<void>(
      '/ai/perf',
      data: {'marks': marks.length > 12 ? marks.sublist(marks.length - 12) : marks},
    );
  } catch (_) {
    /* fail-open */
  }
}
