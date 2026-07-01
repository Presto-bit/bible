/// 在线后端连通冒烟测试（默认仅在本地后端可达时运行）。
///
/// 运行：后端起在 127.0.0.1:8000 时执行
///   flutter test test/live_backend_test.dart
/// 不可达则整组跳过，不影响 CI。
library;

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:presto_bible/features/bible/bible_repository.dart';
import 'package:presto_bible/features/assistant/assistant_repository.dart';
import 'package:presto_bible/features/assistant/models.dart';

const _base = 'http://127.0.0.1:8011';

Future<bool> _up(Dio dio) async {
  try {
    final r = await dio.get('/health');
    return r.data['status'] == 'ok';
  } catch (_) {
    return false;
  }
}

void main() {
  late Dio dio;

  setUpAll(() {
    dio = Dio(BaseOptions(
      baseUrl: _base,
      connectTimeout: const Duration(seconds: 3),
      receiveTimeout: const Duration(seconds: 60),
    ));
  });

  test('经文目录 + 章节（端到端）', () async {
    if (!await _up(dio)) {
      markTestSkipped('后端不可达，跳过');
      return;
    }
    final repo = BibleRepository(dio);
    final books = await repo.books();
    expect(books, isNotEmpty);
    final ch = await repo.chapter('JHN', 3);
    expect(ch.bookName, isNotEmpty);
    expect(ch.verses.any((v) => v.verse == 16), isTrue);
  }, timeout: const Timeout(Duration(seconds: 20)));

  test('小爱 SSE meta 事件携带引用与限额（端到端，会调用 LLM）', () async {
    if (!await _up(dio)) {
      markTestSkipped('后端不可达，跳过');
      return;
    }
    final repo = AssistantRepository(dio);
    ChatMeta? meta;
    await for (final e in repo.chat(ref: 'JHN.3.16', mode: AssistantMode.explain)) {
      if (e is MetaEvent) {
        meta = e.meta;
        break; // 拿到 meta 即可，不必等完整流，省 token
      }
      if (e is ErrorEvent) {
        markTestSkipped('AI 不可用：${e.message}');
        return;
      }
    }
    expect(meta, isNotNull);
    expect(meta!.quotaLimit, greaterThan(0));
  }, timeout: const Timeout(Duration(seconds: 40)));
}
