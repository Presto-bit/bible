/// 半屏小爱会话 thread（进程内；关半屏同 ref+选区 可恢复）。
library;

import '../assistant/assistant_scenes.dart';
import '../assistant/models.dart';

class HalfSheetTurn {
  HalfSheetTurn({
    required this.id,
    required this.userQuestion,
    required this.answer,
    required this.citations,
    required this.scene,
    required this.followups,
  });

  final String id;
  final String userQuestion;
  String answer;
  List<Citation> citations;
  AssistantScene scene;
  List<String> followups;
}

class HalfSheetThread {
  HalfSheetThread({
    required this.ref,
    required this.selectionKey,
    required this.turns,
  });

  final String ref;
  final String selectionKey;
  final List<HalfSheetTurn> turns;
}

const _maxTurns = 3;
final _threads = <String, HalfSheetThread>{};

String _threadKey(String ref, String selectionKey) =>
    '${ref.trim().toUpperCase()}\u001e$selectionKey';

HalfSheetThread? readHalfSheetThread(String ref, String selectionKey) =>
    _threads[_threadKey(ref, selectionKey)];

void writeHalfSheetThread(HalfSheetThread thread) {
  final turns = thread.turns.length > _maxTurns
      ? thread.turns.sublist(thread.turns.length - _maxTurns)
      : thread.turns;
  _threads[_threadKey(thread.ref, thread.selectionKey)] = HalfSheetThread(
    ref: thread.ref,
    selectionKey: thread.selectionKey,
    turns: turns,
  );
  if (_threads.length > 32) {
    _threads.remove(_threads.keys.first);
  }
}

String newHalfSheetTurnId() =>
    't_${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}_${DateTime.now().microsecond.toRadixString(36)}';

bool _refMatchesPrefix(String ref, String prefix) {
  final r = ref.trim().toUpperCase();
  final p = prefix.trim().toUpperCase();
  if (r.isEmpty || p.isEmpty) return false;
  return r == p || r.startsWith('$p.');
}

/// 按 ref 前缀清理进程内半屏会话 thread。
int clearHalfSheetThreadsForRefPrefix(String refPrefix) {
  final keys = _threads.keys
      .where((key) {
        final ref = key.split('\u001e').first;
        return _refMatchesPrefix(ref, refPrefix);
      })
      .toList(growable: false);
  for (final key in keys) {
    _threads.remove(key);
  }
  return keys.length;
}
