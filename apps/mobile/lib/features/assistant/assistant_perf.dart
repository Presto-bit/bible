/// 小爱单次 SSE 流式关键路径耗时（客户端 RUM，对齐 Web assistant_perf.ts）。
library;

import 'assistant_visible.dart';

class AssistantPerfDetail {
  const AssistantPerfDetail({this.surface, this.scene});

  final String? surface;
  final String? scene;
}

class AssistantStreamPerf {
  AssistantStreamPerf([this.detail = const AssistantPerfDetail()]);

  final AssistantPerfDetail detail;
  final int _t0 = DateTime.now().millisecondsSinceEpoch;

  int? _tPlaceholderMeta;
  int? _tFullMeta;
  int? _tFirstToken;
  int? _tVisible;
  bool _finished = false;

  static const _maxMarks = 40;
  static final List<_PerfMark> _buffer = [];

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
      _record('assistant.prepare', prepareMs, {
        ..._detailMap,
        'cacheHit': cacheHit,
        'cacheSource': cacheSource,
        'source': 'server',
      });
    } else if (_tPlaceholderMeta != null && _tFullMeta != null) {
      _record('assistant.prepare', _tFullMeta! - _tPlaceholderMeta!, {
        ..._detailMap,
        'cacheHit': cacheHit,
        'cacheSource': cacheSource,
        'source': 'client',
      });
    }
    if (cacheHit == true) {
      _record('assistant.cache_hit', _now() - _t0, {
        ..._detailMap,
        'cacheSource': cacheSource,
      });
    }
  }

  void onFirstToken() {
    if (_tFirstToken != null) return;
    _tFirstToken = _now();
    _record('assistant.first_token', _tFirstToken! - _t0, _detailMap);
  }

  void onTextUpdate(String text) {
    if (_tVisible != null) return;
    if (!hasVisibleAnswerContent(text)) return;
    _tVisible = _now();
    _record('assistant.visible', _tVisible! - _t0, _detailMap);
  }

  void onDone() {
    if (_finished) return;
    _finished = true;
    final doneAt = _now();
    _record('assistant.done', doneAt - _t0, _detailMap);
    if (_tFirstToken != null) {
      _record('assistant.stream_body', doneAt - _tFirstToken!, _detailMap);
    }
  }

  void onError() {
    _finished = true;
    _record('assistant.error', _now() - _t0, _detailMap);
  }

  Map<String, Object?> get _detailMap => {
        if (detail.surface != null) 'surface': detail.surface,
        if (detail.scene != null) 'scene': detail.scene,
      };

  int _now() => DateTime.now().millisecondsSinceEpoch;

  static void _record(
    String name,
    int ms, [
    Map<String, Object?>? detail,
  ]) {
    if (ms < 0) return;
    _buffer.add(_PerfMark(name, ms, DateTime.now().millisecondsSinceEpoch, detail));
    if (_buffer.length > _maxMarks) {
      _buffer.removeAt(0);
    }
    assert(() {
      // ignore: avoid_print
      print('[perf] $name ${ms}ms ${detail ?? ''}');
      return true;
    }());
  }

  /// 调试/测试读取最近打点。
  static List<Map<String, Object?>> recentMarks() => [
        for (final m in _buffer)
          {
            'name': m.name,
            'ms': m.ms,
            'at': m.at,
            if (m.detail != null) ...m.detail!,
          },
      ];
}

class _PerfMark {
  _PerfMark(this.name, this.ms, this.at, this.detail);
  final String name;
  final int ms;
  final int at;
  final Map<String, Object?>? detail;
}
