/// P4：消费 section_* SSE，按节累积 Markdown。
library;

import 'assistant_sections.dart';

class StreamSection {
  const StreamSection({
    required this.id,
    required this.title,
    required this.text,
    this.finalized = false,
  });

  final String id;
  final String title;
  final String text;
  final bool finalized;
}

class _SectionEntry {
  _SectionEntry({
    required this.id,
    required this.title,
    this.text = '',
    this.finalized = false,
  });

  final String id;
  String title;
  String text;
  bool finalized;
}

class SectionStreamAccumulator {
  final Map<String, _SectionEntry> _entries = {};
  final List<String> _order = [];
  bool _active = false;

  bool get active => _active;

  void seedFromPlan(List<String>? titles) {
    if (titles == null || titles.isEmpty) return;
    for (final title in titles) {
      final id = sectionSlug(title);
      if (_entries.containsKey(id)) continue;
      _entries[id] = _SectionEntry(id: id, title: title);
      _order.add(id);
    }
    if (_order.isNotEmpty) _active = true;
  }

  void onStart({required String id, required String title}) {
    _active = true;
    final sid = id.trim().isNotEmpty ? id.trim() : sectionSlug(title);
    final stitle = title.trim().isNotEmpty ? title.trim() : sid;
    final existing = _entries[sid];
    if (existing == null) {
      _entries[sid] = _SectionEntry(id: sid, title: stitle);
      _order.add(sid);
      return;
    }
    if (stitle.isNotEmpty) existing.title = stitle;
  }

  void onDelta({required String id, required String text}) {
    if (text.isEmpty) return;
    _active = true;
    final sid = id.trim();
    if (sid.isEmpty) return;
    var entry = _entries[sid];
    if (entry == null) {
      entry = _SectionEntry(id: sid, title: sid);
      _entries[sid] = entry;
      _order.add(sid);
    }
    entry.text += text;
  }

  void onDone({required String id, required String title, required String text}) {
    _active = true;
    final sid = id.trim().isNotEmpty ? id.trim() : sectionSlug(title);
    final stitle = title.trim().isNotEmpty ? title.trim() : sid;
    var entry = _entries[sid];
    if (entry == null) {
      entry = _SectionEntry(id: sid, title: stitle);
      _entries[sid] = entry;
      _order.add(sid);
    }
    entry.title = stitle;
    final incoming = text.trim();
    if (incoming.isNotEmpty &&
        (entry.text.trim().isEmpty ||
            incoming.length >= entry.text.trim().length)) {
      entry.text = incoming;
    }
    entry.finalized = true;
  }

  String toMarkdown() {
    final parts = <String>[];
    for (final sid in _order) {
      final entry = _entries[sid];
      if (entry == null) continue;
      if (entry.text.trim().isEmpty) continue;
      parts.add('### ${entry.title}\n${entry.text}'.trimRight());
    }
    return parts.join('\n\n').trim();
  }

  List<AnswerSection> getSections() {
    return _order
        .map((sid) => _entries[sid])
        .whereType<_SectionEntry>()
        .map((e) => AnswerSection(id: e.id, title: e.title))
        .toList();
  }

  Set<String> getWrittenSectionIds() {
    final out = <String>{};
    for (final sid in _order) {
      final entry = _entries[sid];
      if (entry != null && entry.text.trim().isNotEmpty) {
        out.add(sid);
      }
    }
    return out;
  }

  List<StreamSection> getRenderableSections() {
    return _order
        .map((sid) => _entries[sid])
        .whereType<_SectionEntry>()
        .where((e) => e.text.trim().isNotEmpty || !e.finalized)
        .map(
          (e) => StreamSection(
            id: e.id,
            title: e.title,
            text: e.text,
            finalized: e.finalized,
          ),
        )
        .toList();
  }
}
