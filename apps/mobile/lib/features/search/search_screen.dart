/// 全局搜索：经文 FTS + 人生主题 + 搜索历史（对齐 PWA `app/search/page.tsx`）。
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/app_shell.dart';
import '../../core/api_client.dart';
import '../../core/ref_label.dart' show formatGroupRefLabel;
import '../../core/theme.dart';
import '../../core/widgets/paper_card.dart';
import '../knowledge/knowledge_explore.dart';
import '../assistant/assistant_seed.dart';
import '../bible/bible_repository.dart';
import '../bible/reader_screen.dart' show readerJumpProvider;
import '../notes/notes_repository.dart';

const _themeTags = ['盼望', '焦虑', '祷告', '家庭', '工作', '悲伤', '信心', '宽恕'];
const _historyKey = 'search_history';
const _searchDebounceMs = 320;
const _searchPageSize = 40;

/// 含中文时单字即可搜，纯拉丁词需至少 2 字符。
bool searchTooShort(String q) {
  final hasCjk = q.runes.any((r) => r >= 0x4e00 && r <= 0x9fff);
  return q.length < (hasCjk ? 1 : 2);
}

const _ntBookIds = {
  'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH',
  'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS',
  '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
};

enum _ScopeTab { all, ot, nt }

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _controller = TextEditingController();
  String _query = '';
  String _debounced = '';
  Timer? _debounce;
  List<String> _history = [];
  _ScopeTab _scope = _ScopeTab.all;
  var _visibleCount = _searchPageSize;
  String _searchVersion = 'cuvs';

  @override
  void initState() {
    super.initState();
    _loadHistory();
    final main = ref.read(prefsProvider).getString('reader_main_version');
    if (main != null && main.isNotEmpty) _searchVersion = main;
    _controller.addListener(() {
      final q = _controller.text;
      setState(() => _query = q);
      _debounce?.cancel();
      _debounce = Timer(const Duration(milliseconds: _searchDebounceMs), () {
        if (!mounted) return;
        setState(() {
          _debounced = q.trim();
          _visibleCount = _searchPageSize;
        });
      });
    });
  }

  void _loadHistory() {
    final raw = ref.read(prefsProvider).getStringList(_historyKey);
    if (raw != null) _history = raw;
  }

  Future<void> _saveHistory(String q) async {
    final trimmed = q.trim();
    if (trimmed.isEmpty) return;
    final next =
        [trimmed, ..._history.where((h) => h != trimmed)].take(20).toList();
    await ref.read(prefsProvider).setStringList(_historyKey, next);
    setState(() => _history = next);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _openAssistant(String osis, String text) {
    ref.read(assistantSeedProvider.notifier).open(
          ref: osis,
          question:
              '请解释：${text.length > 24 ? '${text.substring(0, 24)}…' : text}',
        );
    ref.read(navIndexProvider.notifier).set(2);
    Navigator.of(context).pop();
  }

  void _openReader(BibleSearchHit hit) {
    ref.read(readerJumpProvider.notifier).jump(hit.book, hit.chapter);
    ref.read(navIndexProvider.notifier).set(1);
    Navigator.of(context).pop();
  }

  List<String> _highlightTerms(String query) {
    final raw = query
        .replaceAll(RegExp(r'["""''「」]'), ' ')
        .replaceAll(RegExp(r'(?:书卷|book)\s*[:：]\s*\S+', caseSensitive: false), ' ')
        .replaceAll(RegExp(r'(?:^|\s)-\S+'), ' ')
        .trim();
    if (raw.isEmpty) return const [];
    return raw.split(RegExp(r'\s+')).where((t) => t.isNotEmpty).toSet().toList();
  }

  List<BibleSearchHit> _filterScope(List<BibleSearchHit> list) {
    switch (_scope) {
      case _ScopeTab.all:
        return list;
      case _ScopeTab.ot:
        return list
            .where((h) => !_ntBookIds.contains(h.book.toUpperCase()))
            .toList();
      case _ScopeTab.nt:
        return list
            .where((h) => _ntBookIds.contains(h.book.toUpperCase()))
            .toList();
    }
  }

  @override
  Widget build(BuildContext context) {
    final searchQ = _debounced;
    final hits = ref.watch(
      bibleSearchProvider((q: searchQ, version: _searchVersion)),
    );
    final terms = _highlightTerms(searchQ);
    final versionsAsync = ref.watch(bibleVersionsProvider);
    final versionLabel = versionsAsync.maybeWhen(
      data: (vs) {
        final m = vs.where((v) => v.id == _searchVersion);
        return m.isNotEmpty ? m.first.label : _searchVersion.toUpperCase();
      },
      orElse: () => _searchVersion.toUpperCase(),
    );

    return Scaffold(
      backgroundColor: AppColors.paper,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text('搜索'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          TextField(
            controller: _controller,
            autofocus: true,
            decoration: InputDecoration(
              hintText: '搜索经文、人生主题…',
              filled: true,
              fillColor: AppColors.surface,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.line),
              ),
              suffixIcon: _query.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, size: 20),
                      onPressed: () => _controller.clear(),
                    )
                  : null,
            ),
            onSubmitted: _saveHistory,
          ),
          const SizedBox(height: 14),
          const Text('知识探索',
              style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                  color: AppColors.ink)),
          const SizedBox(height: 8),
          const KnowledgeHub(),
          const SizedBox(height: 8),
          const Text(
            '高级语法： "整段精确"  ·  书卷:约翰福音  ·  -排除词',
            style: TextStyle(fontSize: 11.5, color: AppColors.inkFaint),
          ),
          if (_history.isNotEmpty) ...[
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _history
                  .map((h) => ActionChip(
                        label: Text(h, style: const TextStyle(fontSize: 12)),
                        backgroundColor: AppColors.surface,
                        side: const BorderSide(color: AppColors.line),
                        onPressed: () {
                          _controller.text = h;
                          _saveHistory(h);
                        },
                      ))
                  .toList(),
            ),
          ],
          if (!searchTooShort(searchQ)) ...[
            const SizedBox(height: 18),
            Row(
              children: [
                const Text('经文',
                    style:
                        TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                const Spacer(),
                for (final tab in _ScopeTab.values)
                  Padding(
                    padding: const EdgeInsets.only(left: 6),
                    child: ChoiceChip(
                      label: Text(
                        switch (tab) {
                          _ScopeTab.all => '全部',
                          _ScopeTab.ot => '旧约',
                          _ScopeTab.nt => '新约',
                        },
                        style: const TextStyle(fontSize: 12),
                      ),
                      selected: _scope == tab,
                      visualDensity: VisualDensity.compact,
                      onSelected: (_) => setState(() {
                        _scope = tab;
                        _visibleCount = _searchPageSize;
                      }),
                    ),
                  ),
                versionsAsync.maybeWhen(
                  data: (vs) {
                    if (vs.isEmpty) return const SizedBox.shrink();
                    return Padding(
                      padding: const EdgeInsets.only(left: 6),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: vs.any((v) => v.id == _searchVersion)
                              ? _searchVersion
                              : vs.first.id,
                          isDense: true,
                          style: const TextStyle(
                              fontSize: 12, color: AppColors.ink),
                          items: vs
                              .map((v) => DropdownMenuItem(
                                    value: v.id,
                                    child: Text(v.label.isNotEmpty
                                        ? v.label
                                        : v.id.toUpperCase()),
                                  ))
                              .toList(),
                          onChanged: (id) {
                            if (id == null) return;
                            setState(() {
                              _searchVersion = id;
                              _visibleCount = _searchPageSize;
                              _scope = _ScopeTab.all;
                            });
                          },
                        ),
                      ),
                    );
                  },
                  orElse: () => const SizedBox.shrink(),
                ),
              ],
            ),
            const SizedBox(height: 6),
            hits.when(
              loading: () => Text(
                switch (_scope) {
                  _ScopeTab.all => '全部 · $versionLabel · 搜索中…',
                  _ScopeTab.ot => '旧约 · $versionLabel · 搜索中…',
                  _ScopeTab.nt => '新约 · $versionLabel · 搜索中…',
                },
                style: const TextStyle(
                    fontSize: 12, color: AppColors.inkFaint),
              ),
              error: (_, __) => const SizedBox.shrink(),
              data: (list) {
                final filtered = _filterScope(list);
                return Text(
                  () {
                    final scope = switch (_scope) {
                      _ScopeTab.all => '全部',
                      _ScopeTab.ot => '旧约',
                      _ScopeTab.nt => '新约',
                    };
                    final shown =
                        filtered.take(_visibleCount).length;
                    return '$scope · $versionLabel · 已显示 $shown/${filtered.length}';
                  }(),
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.inkFaint),
                );
              },
            ),
            const SizedBox(height: 8),
            hits.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Text('搜索失败：$e',
                  style: const TextStyle(color: AppColors.inkFaint)),
              data: (list) {
                final filtered = _filterScope(list);
                if (filtered.isEmpty) {
                  return const Text('未找到匹配经文，试试下方人生主题',
                      style:
                          TextStyle(color: AppColors.inkFaint, fontSize: 13));
                }
                final shown = filtered.take(_visibleCount).toList();
                return Column(
                  children: [
                    ...shown.map((h) => Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: PaperCard(
                            onTap: () {
                              _saveHistory(searchQ);
                              _openReader(h);
                            },
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        formatGroupRefLabel(h.ref).isNotEmpty
                                            ? formatGroupRefLabel(h.ref)
                                            : h.ref,
                                        style: const TextStyle(
                                            fontWeight: FontWeight.w700,
                                            fontSize: 13,
                                            color: AppColors.accentDeep),
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: AppColors.accentWash,
                                        borderRadius:
                                            BorderRadius.circular(6),
                                      ),
                                      child: Text(
                                          (h.version.isNotEmpty
                                                  ? h.version
                                                  : _searchVersion)
                                              .toUpperCase(),
                                          style: const TextStyle(
                                              fontSize: 10,
                                              fontWeight: FontWeight.w600,
                                              color: AppColors.accentDeep)),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                _HighlightedText(
                                  text: h.text,
                                  terms: terms,
                                ),
                                const SizedBox(height: 8),
                                TextButton(
                                  style: TextButton.styleFrom(
                                      padding: EdgeInsets.zero,
                                      minimumSize: Size.zero,
                                      tapTargetSize:
                                          MaterialTapTargetSize.shrinkWrap),
                                  onPressed: () {
                                    _saveHistory(searchQ);
                                    _openAssistant(h.osis, h.text);
                                  },
                                  child: const Text('问小爱',
                                      style: TextStyle(fontSize: 12)),
                                ),
                              ],
                            ),
                          ),
                        )),
                    if (filtered.length > shown.length)
                      TextButton(
                        onPressed: () => setState(
                            () => _visibleCount += _searchPageSize),
                        child: Text(
                            '加载更多（${filtered.length - shown.length}）'),
                      ),
                  ],
                );
              },
            ),
            _NotesGroup(query: searchQ),
          ],
          const SizedBox(height: 18),
          const Text('人生主题',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
          const SizedBox(height: 10),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 2.4,
            children: _themeTags
                .map((t) => PaperCard(
                      tier: 2,
                      onTap: () {
                        _controller.text = t;
                        _saveHistory(t);
                      },
                      child: Center(
                        child: Text(t,
                            style: const TextStyle(
                                fontWeight: FontWeight.w600,
                                color: AppColors.ink)),
                      ),
                    ))
                .toList(),
          ),
        ],
      ),
    );
  }
}

class _HighlightedText extends StatelessWidget {
  const _HighlightedText({
    required this.text,
    required this.terms,
  });
  final String text;
  final List<String> terms;

  @override
  Widget build(BuildContext context) {
    final base = const TextStyle(
      color: AppColors.inkSoft,
      height: 1.55,
      fontSize: 13.5,
    );
    if (terms.isEmpty) {
      return Text(text, style: base);
    }
    final pattern = terms.map(RegExp.escape).join('|');
    final re = RegExp('($pattern)', caseSensitive: false);
    final spans = <TextSpan>[];
    var start = 0;
    for (final m in re.allMatches(text)) {
      if (m.start > start) {
        spans.add(TextSpan(text: text.substring(start, m.start)));
      }
      spans.add(TextSpan(
        text: m.group(0),
        style: base.copyWith(
          backgroundColor: AppColors.accentWash,
          color: AppColors.accentDeep,
          fontWeight: FontWeight.w600,
        ),
      ));
      start = m.end;
    }
    if (start < text.length) {
      spans.add(TextSpan(text: text.substring(start)));
    }
    return Text.rich(
      TextSpan(style: base, children: spans),
    );
  }
}

/// 笔记搜索分组：本地笔记按关键词过滤（与经文结果并列展示）。
class _NotesGroup extends ConsumerWidget {
  const _NotesGroup({required this.query});
  final String query;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notesAsync = ref.watch(notesStreamProvider);
    final notes = notesAsync.maybeWhen(
      data: (list) {
        final q = query.toLowerCase();
        return list
            .where((n) =>
                n.body.toLowerCase().contains(q) ||
                (n.ref ?? '').toLowerCase().contains(q))
            .take(10)
            .toList();
      },
      orElse: () => const [],
    );
    if (notes.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 18),
        Text('笔记 · ${notes.length}',
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
        const SizedBox(height: 8),
        ...notes.map((n) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: PaperCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if ((n.ref ?? '').isNotEmpty)
                      Text(n.ref!,
                          style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                              color: AppColors.gold)),
                    if ((n.ref ?? '').isNotEmpty) const SizedBox(height: 4),
                    Text(n.body,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: AppColors.ink, height: 1.5, fontSize: 13)),
                  ],
                ),
              ),
            )),
      ],
    );
  }
}

class BibleSearchHit {
  BibleSearchHit({
    required this.book,
    required this.ref,
    required this.osis,
    required this.text,
    required this.chapter,
    required this.verse,
    required this.version,
  });
  final String book;
  final String ref;
  final String osis;
  final String text;
  final int chapter;
  final int verse;
  final String version;

  factory BibleSearchHit.fromJson(Map<String, dynamic> j) => BibleSearchHit(
        book: j['book'] as String,
        ref: j['ref'] as String,
        osis: j['osis'] as String,
        text: j['text'] as String,
        chapter: j['chapter'] as int,
        verse: j['verse'] as int,
        version: (j['version'] as String?) ?? 'cnv',
      );
}

final bibleSearchProvider = FutureProvider.family<List<BibleSearchHit>,
    ({String q, String version})>((ref, key) async {
  if (searchTooShort(key.q)) return [];
  final dio = ref.watch(dioProvider);
  final res = await dio.get('/bible/search', queryParameters: {
    'q': key.q,
    'limit': 100,
    'version': key.version,
  });
  final hits = (res.data['hits'] ?? []) as List;
  return hits
      .map((e) => BibleSearchHit.fromJson(e as Map<String, dynamic>))
      .toList();
});
