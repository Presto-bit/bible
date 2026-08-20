/// 全局搜索：经文 FTS + 知识探索 + 搜索历史。
library;

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/app_shell.dart';
import '../../core/api_client.dart';
import '../../core/ref_label.dart' show formatGroupRefLabel;
import '../../core/theme.dart';
import '../../core/widgets/paper_card.dart';
import '../knowledge/knowledge_explore.dart';
import '../assistant/assistant_seed.dart';
import '../bible/bible_repository.dart';
import '../bible/content_repository.dart';
import '../bible/dictionary_match.dart';
import '../bible/reader_screen.dart'
    show readerJumpProvider, readerReturnProvider, ReaderReturnTarget;
import '../notes/notes_repository.dart';

const _historyKey = 'search_history';
const _searchDebounceMs = 320;
const _searchPageSize = 40;

/// 含中文时单字即可搜，纯拉丁词需至少 2 字符。
bool searchTooShort(String q) {
  final hasCjk = q.runes.any((r) => r >= 0x4e00 && r <= 0x9fff);
  return q.length < (hasCjk ? 1 : 2);
}

const _ntBookIds = {
  'MAT',
  'MRK',
  'LUK',
  'JHN',
  'ACT',
  'ROM',
  '1CO',
  '2CO',
  'GAL',
  'EPH',
  'PHP',
  'COL',
  '1TH',
  '2TH',
  '1TI',
  '2TI',
  'TIT',
  'PHM',
  'HEB',
  'JAS',
  '1PE',
  '2PE',
  '1JN',
  '2JN',
  '3JN',
  'JUD',
  'REV',
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
  String _searchVersion = 'cuvs';

  List<BibleSearchHit> _hits = [];
  int _total = 0;
  int _totalOt = 0;
  int _totalNt = 0;
  bool _hasMore = false;
  bool _loading = false;
  bool _loadingMore = false;
  Object? _error;
  int _searchGen = 0;

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
        final next = q.trim();
        if (next == _debounced) return;
        setState(() => _debounced = next);
        unawaited(_runSearch(reset: true));
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
    final next = [
      trimmed,
      ..._history.where((h) => h != trimmed),
    ].take(20).toList();
    await ref.read(prefsProvider).setStringList(_historyKey, next);
    setState(() => _history = next);
  }

  String? get _testamentParam => switch (_scope) {
    _ScopeTab.all => null,
    _ScopeTab.ot => 'OT',
    _ScopeTab.nt => 'NT',
  };

  Future<BibleSearchPage> _fetchPage({required int offset}) async {
    final dio = ref.read(dioProvider);
    final qp = <String, dynamic>{
      'q': _debounced,
      'limit': _searchPageSize,
      'offset': offset,
      'version': _searchVersion,
    };
    final testament = _testamentParam;
    if (testament != null) qp['testament'] = testament;
    final res = await dio.get<Map<String, dynamic>>(
      '/bible/search',
      queryParameters: qp,
    );
    return BibleSearchPage.fromJson(res.data ?? const {});
  }

  Future<void> _runSearch({required bool reset}) async {
    final q = _debounced;
    if (searchTooShort(q)) {
      setState(() {
        _hits = [];
        _total = 0;
        _totalOt = 0;
        _totalNt = 0;
        _hasMore = false;
        _loading = false;
        _loadingMore = false;
        _error = null;
      });
      return;
    }
    final gen = ++_searchGen;
    if (reset) {
      setState(() {
        _loading = true;
        _error = null;
        _hits = [];
        _hasMore = false;
      });
    } else {
      if (_loadingMore || !_hasMore) return;
      setState(() => _loadingMore = true);
    }
    try {
      final page = await _fetchPage(offset: reset ? 0 : _hits.length);
      if (!mounted || gen != _searchGen) return;
      setState(() {
        if (reset) {
          _hits = page.hits;
        } else {
          final seen = {for (final h in _hits) '${h.osis}|${h.version}'};
          final merged = [..._hits];
          for (final h in page.hits) {
            final key = '${h.osis}|${h.version}';
            if (seen.add(key)) merged.add(h);
          }
          _hits = merged;
        }
        _total = page.total;
        _totalOt = page.totalOt;
        _totalNt = page.totalNt;
        _hasMore = page.hasMore;
        _error = null;
      });
    } on DioException catch (e) {
      if (!mounted || gen != _searchGen) return;
      setState(() => _error = e.message ?? e);
    } catch (e) {
      if (!mounted || gen != _searchGen) return;
      setState(() => _error = e);
    } finally {
      if (mounted && gen == _searchGen) {
        setState(() {
          _loading = false;
          _loadingMore = false;
        });
      }
    }
  }

  void _setScope(_ScopeTab tab) {
    if (_scope == tab) return;
    setState(() => _scope = tab);
    // 约别走 API testament，避免「亚伯拉罕」等被旧约前 N 条截断后新约空白
    unawaited(_runSearch(reset: true));
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _openAssistant(String osis, String text) {
    ref
        .read(assistantSeedProvider.notifier)
        .open(
          ref: osis,
          question:
              '请解释：${text.length > 24 ? '${text.substring(0, 24)}…' : text}',
        );
    ref.read(navIndexProvider.notifier).set(2);
    Navigator.of(context).pop();
  }

  void _openReader(BibleSearchHit hit) {
    ref.read(readerReturnProvider.notifier).set(
          ReaderReturnTarget(
            label: '搜索',
            onBack: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const SearchScreen()),
              );
            },
          ),
        );
    ref.read(readerJumpProvider.notifier).jump(hit.book, hit.chapter);
    ref.read(navIndexProvider.notifier).set(1);
    Navigator.of(context).pop();
  }

  List<String> _highlightTerms(String query) {
    final raw = query
        .replaceAll(
          RegExp(
            r'["""'
            '「」]',
          ),
          ' ',
        )
        .replaceAll(
          RegExp(r'(?:书卷|book)\s*[:：]\s*\S+', caseSensitive: false),
          ' ',
        )
        .replaceAll(RegExp(r'(?:^|\s)-\S+'), ' ')
        .trim();
    if (raw.isEmpty) return const [];
    return raw
        .split(RegExp(r'\s+'))
        .where((t) => t.isNotEmpty)
        .toSet()
        .toList();
  }

  bool get _showNtHint {
    if (_scope != _ScopeTab.all || _loading || _totalNt <= 0) return false;
    return !_hits.any((h) => _ntBookIds.contains(h.book.toUpperCase()));
  }

  @override
  Widget build(BuildContext context) {
    final searchQ = _debounced;
    final terms = _highlightTerms(searchQ);
    final versionsAsync = ref.watch(bibleVersionsProvider);
    final versionLabel = versionsAsync.maybeWhen(
      data: (vs) {
        final m = vs.where((v) => v.id == _searchVersion);
        return m.isNotEmpty ? m.first.label : _searchVersion.toUpperCase();
      },
      orElse: () => _searchVersion.toUpperCase(),
    );
    final scopeLabel = switch (_scope) {
      _ScopeTab.all => '全部',
      _ScopeTab.ot => '旧约',
      _ScopeTab.nt => '新约',
    };
    final entityAsync = searchTooShort(searchQ)
        ? const AsyncValue<List<DictEntity>>.data([])
        : ref.watch(dictionaryProvider(searchQ));
    final entityHits = entityAsync.maybeWhen(
      data: (list) => list.take(8).toList(),
      orElse: () => const <DictEntity>[],
    );
    final entityLoading = !searchTooShort(searchQ) && entityAsync.isLoading;

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
              hintText: '搜索经文…',
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
          const Text(
            '知识探索',
            style: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 14,
              color: AppColors.ink,
            ),
          ),
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
                  .map(
                    (h) => ActionChip(
                      label: Text(h, style: const TextStyle(fontSize: 12)),
                      backgroundColor: AppColors.surface,
                      side: const BorderSide(color: AppColors.line),
                      onPressed: () {
                        _controller.text = h;
                        _saveHistory(h);
                      },
                    ),
                  )
                  .toList(),
            ),
          ],
          if (!searchTooShort(searchQ)) ...[
            const SizedBox(height: 18),
            if (entityLoading || entityHits.isNotEmpty) ...[
              const Text(
                '人物与地点',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
              ),
              const SizedBox(height: 8),
              if (entityLoading)
                const Text(
                  '查找词条…',
                  style: TextStyle(fontSize: 13, color: AppColors.inkFaint),
                )
              else
                ...entityHits.map(
                  (ent) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: PaperCard(
                      padding: const EdgeInsets.all(12),
                      onTap: () {
                        _saveHistory(searchQ);
                        context.push(
                          '/dictionary/${Uri.encodeComponent(ent.id)}',
                        );
                      },
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  entityDisplayName(ent),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 14,
                                  ),
                                ),
                              ),
                              if (entityTypeLabel(ent.type).isNotEmpty)
                                Text(
                                  entityTypeLabel(ent.type),
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: AppColors.inkFaint,
                                  ),
                                ),
                            ],
                          ),
                          if (ent.summary.trim().isNotEmpty) ...[
                            const SizedBox(height: 4),
                            Text(
                              ent.summary.length > 48
                                  ? '${ent.summary.substring(0, 48)}…'
                                  : ent.summary,
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.inkFaint,
                                height: 1.4,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
              const SizedBox(height: 8),
            ],
            Row(
              children: [
                const Text(
                  '经文',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                ),
                const Spacer(),
                for (final tab in _ScopeTab.values)
                  Padding(
                    padding: const EdgeInsets.only(left: 6),
                    child: ChoiceChip(
                      label: Text(switch (tab) {
                        _ScopeTab.all => '全部',
                        _ScopeTab.ot => '旧约',
                        _ScopeTab.nt => '新约',
                      }, style: const TextStyle(fontSize: 12)),
                      selected: _scope == tab,
                      visualDensity: VisualDensity.compact,
                      onSelected: (_) => _setScope(tab),
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
                            fontSize: 12,
                            color: AppColors.ink,
                          ),
                          items: vs
                              .map(
                                (v) => DropdownMenuItem(
                                  value: v.id,
                                  child: Text(
                                    v.label.isNotEmpty
                                        ? v.label
                                        : v.id.toUpperCase(),
                                  ),
                                ),
                              )
                              .toList(),
                          onChanged: (id) {
                            if (id == null) return;
                            setState(() {
                              _searchVersion = id;
                              _scope = _ScopeTab.all;
                            });
                            unawaited(_runSearch(reset: true));
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
            Text(
              () {
                if (_loading) {
                  return '$scopeLabel · $versionLabel · 搜索中…';
                }
                final buf = StringBuffer(
                  '$scopeLabel · $versionLabel · 已显示 ${_hits.length}/$_total',
                );
                if (_scope == _ScopeTab.all && (_totalOt > 0 || _totalNt > 0)) {
                  buf.write(' · 旧约 $_totalOt · 新约 $_totalNt');
                }
                return buf.toString();
              }(),
              style: const TextStyle(fontSize: 12, color: AppColors.inkFaint),
            ),
            if (_showNtHint) ...[
              const SizedBox(height: 4),
              Text.rich(
                TextSpan(
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.inkFaint,
                    height: 1.4,
                  ),
                  children: [
                    const TextSpan(text: '当前结果偏靠前卷；新约另有 '),
                    WidgetSpan(
                      alignment: PlaceholderAlignment.baseline,
                      baseline: TextBaseline.alphabetic,
                      child: GestureDetector(
                        onTap: () => _setScope(_ScopeTab.nt),
                        child: Text(
                          '$_totalNt 处',
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.accentDeep,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                    const TextSpan(text: '，点「新约」可直接查看。'),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 8),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else if (_error != null)
              Text(
                '搜索失败：$_error',
                style: const TextStyle(color: AppColors.inkFaint),
              )
            else if (_hits.isEmpty)
              const Text(
                '未找到匹配经文',
                style: TextStyle(color: AppColors.inkFaint, fontSize: 13),
              )
            else
              Column(
                children: [
                  ..._hits.map(
                    (h) => Padding(
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
                                      color: AppColors.accentDeep,
                                    ),
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: AppColors.accentWash,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    (h.version.isNotEmpty
                                            ? h.version
                                            : _searchVersion)
                                        .toUpperCase(),
                                    style: const TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.accentDeep,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            _HighlightedText(text: h.text, terms: terms),
                            const SizedBox(height: 8),
                            TextButton(
                              style: TextButton.styleFrom(
                                padding: EdgeInsets.zero,
                                minimumSize: Size.zero,
                                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              ),
                              onPressed: () {
                                _saveHistory(searchQ);
                                _openAssistant(h.osis, h.text);
                              },
                              child: const Text(
                                '问小爱',
                                style: TextStyle(fontSize: 12),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  if (_hasMore)
                    TextButton(
                      onPressed: _loadingMore
                          ? null
                          : () => unawaited(_runSearch(reset: false)),
                      child: Text(
                        _loadingMore
                            ? '加载中…'
                            : '加载更多（${_total - _hits.length}）',
                      ),
                    ),
                ],
              ),
            _NotesGroup(query: searchQ),
          ],
        ],
      ),
    );
  }
}

class _HighlightedText extends StatelessWidget {
  const _HighlightedText({required this.text, required this.terms});
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
      spans.add(
        TextSpan(
          text: m.group(0),
          style: base.copyWith(
            backgroundColor: AppColors.accentWash,
            color: AppColors.accentDeep,
            fontWeight: FontWeight.w600,
          ),
        ),
      );
      start = m.end;
    }
    if (start < text.length) {
      spans.add(TextSpan(text: text.substring(start)));
    }
    return Text.rich(TextSpan(style: base, children: spans));
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
            .where(
              (n) =>
                  n.body.toLowerCase().contains(q) ||
                  (n.ref ?? '').toLowerCase().contains(q),
            )
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
        Text(
          '笔记 · ${notes.length}',
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
        ),
        const SizedBox(height: 8),
        ...notes.map(
          (n) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: PaperCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if ((n.ref ?? '').isNotEmpty)
                    Text(
                      n.ref!,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                        color: AppColors.gold,
                      ),
                    ),
                  if ((n.ref ?? '').isNotEmpty) const SizedBox(height: 4),
                  Text(
                    n.body,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.ink,
                      height: 1.5,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
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

class BibleSearchPage {
  const BibleSearchPage({
    required this.hits,
    required this.total,
    required this.totalOt,
    required this.totalNt,
    required this.hasMore,
  });

  final List<BibleSearchHit> hits;
  final int total;
  final int totalOt;
  final int totalNt;
  final bool hasMore;

  factory BibleSearchPage.fromJson(Map<String, dynamic> j) {
    final hits = ((j['hits'] ?? []) as List)
        .map((e) => BibleSearchHit.fromJson(e as Map<String, dynamic>))
        .toList();
    final total = (j['total'] as int?) ?? hits.length;
    final offset = (j['offset'] as int?) ?? 0;
    final hasMore = j['has_more'] == true || offset + hits.length < total;
    return BibleSearchPage(
      hits: hits,
      total: total,
      totalOt: (j['total_ot'] as int?) ?? 0,
      totalNt: (j['total_nt'] as int?) ?? 0,
      hasMore: hasMore,
    );
  }
}
