/// 阅读体验增强：主题、进度条、情境头、Focus 模式、轻问小爱、章节缓存。
library;

import 'dart:convert';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api_client.dart' show prefsProvider;
import '../../core/mark_notes.dart';
import 'bible_summary.dart';
import '../../core/database/app_database.dart';
import '../../core/theme.dart';
import '../plans/plan_bar.dart';
import '../plans/plan_reading.dart';
import '../plans/plan_session.dart';
import '../plans/plans_repository.dart';
import '../plans/plan_steps.dart';
import '../notes/notes_repository.dart';
import 'bible_repository.dart';
import 'content_repository.dart';
import 'markings_repository.dart';
import 'models.dart';
import 'outlines.dart';
import 'paragraphs.dart';
import 'reader_focus_bar.dart';
import 'reader_marking_models.dart';
import 'reader_preferences.dart';
import 'reader_thoughts_sheet.dart';
import 'reading_repository.dart';
import 'thoughts_repository.dart';

/// 阅读字号（对齐 H5 中/大/特大）。
enum ReaderFontSize { medium, large, xlarge }

extension ReaderFontSizeX on ReaderFontSize {
  String get label => switch (this) {
        ReaderFontSize.medium => '中',
        ReaderFontSize.large => '大',
        ReaderFontSize.xlarge => '特大',
      };
  double get px => switch (this) {
        ReaderFontSize.medium => 17,
        ReaderFontSize.large => 20,
        ReaderFontSize.xlarge => 24,
      };
}

const _fontSizeKey = 'reader_font_size';

class ReaderFontNotifier extends Notifier<ReaderFontSize> {
  @override
  ReaderFontSize build() {
    final raw = ref.read(prefsProvider).getString(_fontSizeKey);
    return ReaderFontSize.values.firstWhere(
      (e) => e.name == raw,
      orElse: () => ReaderFontSize.medium,
    );
  }

  void set(ReaderFontSize size) {
    state = size;
    ref.read(prefsProvider).setString(_fontSizeKey, size.name);
  }
}

final readerFontProvider =
    NotifierProvider<ReaderFontNotifier, ReaderFontSize>(ReaderFontNotifier.new);

enum ReaderExperienceTheme { morning, night }

extension ReaderExperienceThemeX on ReaderExperienceTheme {
  String get label => switch (this) {
        ReaderExperienceTheme.morning => '清晨',
        ReaderExperienceTheme.night => '夜深',
      };

  Color get background => switch (this) {
        ReaderExperienceTheme.morning => const Color(0xFFFFFCFA),
        ReaderExperienceTheme.night => const Color(0xFF12181C),
      };

  Color get ink => switch (this) {
        ReaderExperienceTheme.night => const Color(0xFFD8E0E6),
        _ => AppColors.ink,
      };
}

enum ReaderVerseNumberMode { inline, margin, hidden }

const _themeKey = 'reader_experience_theme';
const _verseNoKey = 'reader_verse_number_mode';
const _chapterCachePrefix = 'presto_ch_cnv_';

class ReaderExperienceThemeNotifier extends Notifier<ReaderExperienceTheme> {
  @override
  ReaderExperienceTheme build() {
    final prefs = ref.read(prefsProvider);
    final raw = prefs.getString(_themeKey);
    if (raw == 'night') return ReaderExperienceTheme.night;
    if (raw == 'paper') {
      prefs.setString(_themeKey, 'morning');
    }
    return ReaderExperienceTheme.morning;
  }

  void set(ReaderExperienceTheme t) {
    state = t;
    ref.read(prefsProvider).setString(_themeKey, t.name);
  }
}

final readerExperienceThemeProvider =
    NotifierProvider<ReaderExperienceThemeNotifier, ReaderExperienceTheme>(
        ReaderExperienceThemeNotifier.new);

class ReaderVerseNumberNotifier extends Notifier<ReaderVerseNumberMode> {
  @override
  ReaderVerseNumberMode build() {
    final raw = ref.read(prefsProvider).getString(_verseNoKey);
    return ReaderVerseNumberMode.values.firstWhere(
      (e) => e.name == raw,
      orElse: () => ReaderVerseNumberMode.inline,
    );
  }

  void set(ReaderVerseNumberMode m) {
    state = m;
    ref.read(prefsProvider).setString(_verseNoKey, m.name);
  }
}

final readerVerseNumberProvider =
    NotifierProvider<ReaderVerseNumberNotifier, ReaderVerseNumberMode>(
        ReaderVerseNumberNotifier.new);

class ChapterContextInfo {
  const ChapterContextInfo({this.era, this.place, this.summary});
  final String? era;
  final String? place;
  final String? summary;
}

ChapterContextInfo? chapterContextInfo(String bookId, int chapter) {
  const data = <String, Map<int, ChapterContextInfo>>{
    'GEN': {
      1: ChapterContextInfo(
          era: '创造之初', place: '宇宙', summary: '神六日创造天地万物，第七日安息。'),
      3: ChapterContextInfo(
          era: '伊甸园', place: '东方', summary: '人的堕落与救恩的应许。'),
    },
    'EXO': {
      14: ChapterContextInfo(
          era: '出埃及', place: '红海', summary: '神使海水分开，以色列人走干地。'),
      20: ChapterContextInfo(
          era: '西奈山', place: '旷野', summary: '神颁布十诫。'),
    },
    'PSA': {
      23: ChapterContextInfo(
          era: '大卫时代', place: '牧野', summary: '耶和华是我的牧者。'),
    },
    'MAT': {
      5: ChapterContextInfo(
          era: '耶稣事工', place: '加利利', summary: '登山宝训：天国伦理。'),
    },
    'JHN': {
      1: ChapterContextInfo(
          era: '道成肉身', place: '犹太', summary: '太初有道，道成了肉身。'),
      3: ChapterContextInfo(
          era: '耶稣事工', place: '耶路撒冷', summary: '尼哥底母与重生的对话。'),
    },
  };
  return data[bookId.toUpperCase()]?[chapter];
}

double bookProgressInBible(List<BibleBook> books, String bookId, int chapter) {
  if (books.isEmpty) return 0;
  var total = 0;
  var before = 0;
  var found = false;
  for (final b in books) {
    total += b.chapterCount;
    if (b.id == bookId) {
      found = true;
      before += chapter - 1;
      break;
    }
    if (!found) before += b.chapterCount;
  }
  return total > 0 ? before / total : 0;
}

Chapter? readChapterCache(SharedPreferences prefs, String book, int chapter) {
  final raw = prefs.getString('$_chapterCachePrefix${book}_$chapter');
  if (raw == null) return null;
  try {
    final j = jsonDecode(raw) as Map<String, dynamic>;
    final ts = j['ts'] as int? ?? 0;
    if (DateTime.now().millisecondsSinceEpoch - ts > 7 * 86400000) return null;
    return Chapter.fromJson(j['data'] as Map<String, dynamic>);
  } catch (_) {
    return null;
  }
}

void writeChapterCache(
    SharedPreferences prefs, String book, int chapter, Chapter ch) {
  prefs.setString(
    '$_chapterCachePrefix${book}_$chapter',
    jsonEncode({
      'ts': DateTime.now().millisecondsSinceEpoch,
      'data': {
        'book': ch.bookId,
        'name': ch.bookName,
        'chapter': ch.chapter,
        'verses': ch.verses
            .map((v) => {'verse': v.verse, 'text': v.text})
            .toList(),
      },
    }),
  );
}

/// 增强版章阅读主体（对齐 H5 ReaderView，不含听读同步）。
class ReaderChapterBody extends ConsumerStatefulWidget {
  const ReaderChapterBody({
    super.key,
    required this.book,
    required this.chapter,
    required this.books,
    required this.chromeHidden,
    required this.onNav,
    required this.onInteract,
    required this.onRead,
    required this.onAskAi,
    this.compareVersionId,
    this.mainVersionId,
    this.planMeta,
    this.onPlanMetaChange,
    this.onPlanJump,
  });

  final BibleBook book;
  final int chapter;
  final List<BibleBook> books;
  final bool chromeHidden;
  final void Function(int delta) onNav;
  final VoidCallback onInteract;
  final void Function(String book, int chapter) onRead;
  final String? compareVersionId;
  /// 正文译本；null 为默认和合本。
  final String? mainVersionId;
  final PlanReadingMeta? planMeta;
  final ValueChanged<PlanReadingMeta?>? onPlanMetaChange;
  final void Function(String bookId, int chapter)? onPlanJump;

  /// 打开小爱解读弹窗。explainOnly=true 时仅解释选中经文。
  final void Function(
          String refStr, String refLabel, String selectionText, bool explainOnly)
      onAskAi;

  @override
  ConsumerState<ReaderChapterBody> createState() => _ReaderChapterBodyState();
}

class _ReaderChapterBodyState extends ConsumerState<ReaderChapterBody> {
  final Set<int> _selected = {};
  bool _bookDone = false;
  int? _resumeFlashVerse;
  final _resumeAnchorKey = GlobalKey();
  final _scroll = ScrollController();
  final _selectionAnchorKey = GlobalKey();
  double? _focusBarTop;
  bool _resumeScheduled = false;
  bool _planDayFinishScheduled = false;
  Chapter? _cachedChapter;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    final prefs = ref.read(prefsProvider);
    _cachedChapter =
        readChapterCache(prefs, widget.book.id, widget.chapter);
  }

  @override
  void didUpdateWidget(ReaderChapterBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.book.id != widget.book.id ||
        oldWidget.chapter != widget.chapter ||
        oldWidget.planMeta?.day != widget.planMeta?.day) {
      setState(() {
        _selected.clear();
        _bookDone = false;
        _resumeFlashVerse = null;
        _planDayFinishScheduled = false;
        _resumeScheduled = false;
        _cachedChapter = readChapterCache(
            ref.read(prefsProvider), widget.book.id, widget.chapter);
      });
      _persistPlanRef();
    }
  }

  Future<void> _persistPlanRef() async {
    final meta = widget.planMeta;
    if (meta == null || widget.onPlanMetaChange == null) return;
    final refStr = '${widget.book.id}.${widget.chapter}';
    if (meta.session.lastRef == refStr) return;
    final session = updateSessionRef(meta.session, refStr);
    await savePlanSession(ref.read(prefsProvider), session);
    await ref.read(planProgressRepoProvider).mark(
          meta.planId,
          meta.day,
          status: 'active',
          session: session,
        );
    if (!mounted) return;
    widget.onPlanMetaChange!(PlanReadingMeta(
      planId: meta.planId,
      planTitle: meta.planTitle,
      day: meta.day,
      totalDays: meta.totalDays,
      steps: meta.steps,
      session: session,
      source: meta.source,
    ));
  }

  @override
  void dispose() {
    _scroll.removeListener(_onScroll);
    _scroll.dispose();
    super.dispose();
  }

  double _lastOffset = 0;

  void _onScroll() {
    if (!_scroll.hasClients) return;
    final cur = _scroll.position.pixels;
    // 上滑（往回读）即恢复顶栏 + 底部 Tab；下滑继续沉浸。
    if (cur < _lastOffset - 4) widget.onInteract();
    _lastOffset = cur;

    if (_bookDone) return;
    // 仅在「读完整卷」（本卷最后一章滚动到底）时庆祝，避免每章都打扰。
    if (widget.chapter < widget.book.chapterCount) return;
    if (cur >= _scroll.position.maxScrollExtent - 80) {
      setState(() => _bookDone = true);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('🎉 恭喜读完《${widget.book.name}》'),
            duration: const Duration(milliseconds: 2200),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
    if (_selected.isNotEmpty) _scheduleFocusBarLayout();
  }

  void _maybeResume() {
    final saved = ref.read(readingProgressStreamProvider).value;
    if (saved == null ||
        saved.book != widget.book.id ||
        saved.chapter != widget.chapter ||
        saved.verse <= 1) {
      return;
    }
    setState(() => _resumeFlashVerse = saved.verse);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final ctx = _resumeAnchorKey.currentContext;
      if (ctx != null) {
        Scrollable.ensureVisible(
          ctx,
          alignment: 0.38,
          duration: const Duration(milliseconds: 420),
          curve: Curves.easeOutCubic,
        );
      }
      Future.delayed(const Duration(milliseconds: 2600), () {
        if (mounted) setState(() => _resumeFlashVerse = null);
      });
    });
  }

  void _markRead(int verse) {
    ref.read(readingRepoProvider).logVerseRead(
        '${widget.book.id}.${widget.chapter}.$verse');
    ref.read(readingRepoProvider).record(
          widget.book.id,
          widget.chapter,
          verse: verse,
        );
  }

  // 长按：进入选中（单节）。
  void _startSelect(int verse) {
    widget.onInteract();
    setState(() => _selected = {verse});
    _markRead(verse);
    _scheduleFocusBarLayout();
  }

  // 点按：扩展为连续区间（方案 A）。
  void _toggleSelect(int verse) {
    if (_selected.isEmpty) return;
    widget.onInteract();
    final lo = _selected.reduce((a, b) => a < b ? a : b);
    final hi = _selected.reduce((a, b) => a > b ? a : b);
    final start = verse < lo ? verse : lo;
    final end = verse > hi ? verse : hi;
    setState(() => _selected = {for (var i = start; i <= end; i++) i});
    _markRead(verse);
    _scheduleFocusBarLayout();
  }

  void _clearSelection() => setState(() {
        _selected.clear();
        _focusBarTop = null;
      });

  int? get _selectionAnchorVerse {
    final sel = _sortedSel;
    if (sel.isEmpty) return null;
    return sel[sel.length ~/ 2];
  }

  void _scheduleFocusBarLayout() {
    WidgetsBinding.instance.addPostFrameCallback((_) => _layoutFocusBar());
  }

  void _layoutFocusBar() {
    if (!mounted || _selected.isEmpty) {
      if (_focusBarTop != null) setState(() => _focusBarTop = null);
      return;
    }
    final ctx = _selectionAnchorKey.currentContext;
    if (ctx == null) return;
    final box = ctx.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return;
    final offset = box.localToGlobal(Offset.zero);
    final size = box.size;
    final media = MediaQuery.of(context);
    const barEstimate = 112.0;
    const margin = 10.0;
    final topReserve = media.padding.top + (widget.chromeHidden ? 8 : 56);
    final bottomReserve = media.padding.bottom + (widget.chromeHidden ? 16 : 72);
    var top = offset.dy - barEstimate - margin;
    if (top < topReserve) top = offset.dy + size.height + margin;
    final maxTop = media.size.height - barEstimate - bottomReserve;
    top = top.clamp(topReserve, maxTop);
    if (_focusBarTop != top) setState(() => _focusBarTop = top);
  }

  List<int> get _sortedSel => _selected.toList()..sort();

  String _selectionText(Chapter? ch) {
    if (ch == null) return '';
    return ch.verses
        .where((v) => _selected.contains(v.verse))
        .map((v) => v.text)
        .join();
  }

  String get _selectionRefStr =>
      selectionRef(widget.book.id, widget.chapter, _sortedSel);

  String get _refStr => _selectionRefStr;

  String get _refLabel {
    final sel = _sortedSel;
    final name = widget.book.name;
    if (sel.isEmpty) return '$name ${widget.chapter}';
    if (sel.first == sel.last) return '$name ${widget.chapter}:${sel.first}';
    return '$name ${widget.chapter}:${sel.first}-${sel.last}';
  }

  HighlightMark? _currentSelectionMark(Map<String, HighlightMark> map) {
    if (_selected.isEmpty) return null;
    final storage = _highlightStorageRef(map, _sortedSel);
    if (storage == null) return null;
    return map[storage];
  }

  Future<void> _pickHighlightColor(String color) async {
    final sel = _sortedSel;
    if (sel.isEmpty) return;
    final map = ref.read(highlightMapProvider).valueOrNull ?? {};
    final storageRef = _highlightStorageRef(map, sel) ??
        selectionRef(widget.book.id, widget.chapter, sel);
    final added = await ref.read(markingsRepoProvider).toggleHighlight(
          storageRef,
          color: color,
        );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(added ? '已划线' : '已取消划线'),
        duration: const Duration(milliseconds: 1200),
        behavior: SnackBarBehavior.floating,
      ),
    );
    if (added) _promptMarkNote(storageRef);
  }

  Future<void> _promptMarkNote(String refStr) async {
    final controller = TextEditingController();
    final body = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 18,
          bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('写灵修笔记 · $_refLabel',
                style: const TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 15, color: AppColors.ink)),
            const SizedBox(height: 10),
            TextField(
              controller: controller,
              autofocus: true,
              maxLines: 4,
              decoration: const InputDecoration(
                hintText: '记录领受、疑问或祷告…',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton(
                onPressed: () => Navigator.pop(ctx, controller.text),
                style: FilledButton.styleFrom(backgroundColor: AppColors.accentDeep),
                child: const Text('保存'),
              ),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
    if (body == null || body.trim().isEmpty) return;
    final note = await ref.read(notesRepoProvider).create(body: body.trim(), ref: refStr);
    await bindNoteToMark(ref.read(prefsProvider), refStr, note.id);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('笔记已保存'), behavior: SnackBarBehavior.floating),
      );
    }
  }

  Future<void> _clearHighlight() async {
    final sel = _sortedSel;
    if (sel.isEmpty) return;
    final map = ref.read(highlightMapProvider).valueOrNull ?? {};
    final storageRef = _highlightStorageRef(map, sel);
    if (storageRef == null) return;
    await ref.read(markingsRepoProvider).toggleHighlight(
          storageRef,
          color: map[storageRef]?.color ?? 'yellow',
        );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('已取消划线'),
        duration: Duration(milliseconds: 1200),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  String? _highlightStorageRef(Map<String, HighlightMark> map, List<int> sel) {
    final selRef = selectionRef(widget.book.id, widget.chapter, sel);
    if (map.containsKey(selRef)) return selRef;
    for (final v in sel) {
      final k = '${widget.book.id}.${widget.chapter}.$v';
      if (map.containsKey(k)) return k;
    }
    final min = sel.first;
    final max = sel.last;
    for (final k in map.keys) {
      final parts = k.split('.');
      if (parts.length < 3) continue;
      if (parts[0] != widget.book.id || int.tryParse(parts[1]) != widget.chapter) {
        continue;
      }
      final tail = parts[2];
      if (tail.contains('-')) {
        final r = tail.split('-');
        final a = int.tryParse(r[0]);
        final b = int.tryParse(r.length > 1 ? r[1] : r[0]);
        if (a == min && b == max) return k;
        if (a != null && b != null && a <= min && b >= max) return k;
      }
    }
    return null;
  }

  Future<void> _writeThought(Chapter? ch) async {
    final sel = _sortedSel;
    if (sel.isEmpty) return;
    final refStr = selectionRef(widget.book.id, widget.chapter, sel);
    await showWriteThoughtSheet(
      context,
      ref,
      refStr: refStr,
      refLabel: _refLabel,
    );
    _clearSelection();
  }

  void _openThoughtsForVerse(int verse, String text) {
    final refStr = '${widget.book.id}.${widget.chapter}.$verse';
    showThoughtsListSheet(
      context,
      ref,
      refStr: refStr,
      refLabel: '${widget.book.name} ${widget.chapter}:$verse',
      verseText: text,
    );
  }

  Future<void> _toggleBookmark() async {
    final sel = _sortedSel;
    if (sel.isEmpty) return;
    final refStr = sel.first == sel.last
        ? '${widget.book.id}.${widget.chapter}.${sel.first}'
        : '${widget.book.id}.${widget.chapter}.${sel.first}-${sel.last}';
    final added =
        await ref.read(markingsRepoProvider).toggleBookmark(refStr);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(added ? '已收藏' : '已取消收藏'),
        duration: const Duration(milliseconds: 1200),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  void _showSummarySheet(String title, Future<String> Function() load) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _SummarySheet(title: title, load: load),
    );
  }

  void _viewNote(Note note) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('经文笔记',
                style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                    color: AppColors.ink)),
            if (note.ref != null) ...[
              const SizedBox(height: 6),
              Text(note.ref!,
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.inkFaint)),
            ],
            const SizedBox(height: 12),
            Text(note.body,
                style: const TextStyle(fontSize: 15, height: 1.75)),
          ],
        ),
      ),
    );
  }

  Future<void> _persistPlanSession(PlanSession session) async {
    final meta = widget.planMeta;
    if (meta == null || widget.onPlanMetaChange == null) return;
    final prefs = ref.read(prefsProvider);
    await savePlanSession(prefs, session);
    await ref.read(planProgressRepoProvider).mark(
          meta.planId,
          meta.day,
          status: 'active',
          session: session,
        );
    widget.onPlanMetaChange!(PlanReadingMeta(
      planId: meta.planId,
      planTitle: meta.planTitle,
      day: meta.day,
      totalDays: meta.totalDays,
      steps: meta.steps,
      session: session,
      source: meta.source,
    ));
  }

  Future<void> _continuePlanSegment() async {
    final meta = widget.planMeta;
    if (meta == null || widget.onPlanJump == null) return;
    final idx = stepForChapter(meta.steps, widget.book.id, widget.chapter);
    if (idx < 0) return;
    final step = meta.steps[idx];
    var session = await markStepDone(
      ref.read(prefsProvider),
      meta.session,
      step.id,
      meta.steps,
    );
    await _persistPlanSession(session);
    final next = nextIncompleteStep(meta.steps, session.stepsDone);
    if (next != null) {
      final ni = meta.steps.indexWhere((s) => s.id == next.id);
      session = session.copyWith(currentStepIndex: ni);
      await _persistPlanSession(session);
      widget.onPlanJump!(next.bookId, next.chapterStart);
    }
  }

  Future<void> _completePlanDay() async {
    final meta = widget.planMeta;
    if (meta == null) return;
    var session = meta.session;
    final idx = stepForChapter(meta.steps, widget.book.id, widget.chapter);
    if (idx >= 0) {
      final step = meta.steps[idx];
      if (!session.stepsDone.contains(step.id)) {
        session = await markStepDone(
          ref.read(prefsProvider),
          session,
          step.id,
          meta.steps,
        );
      }
    }
    await ref.read(planProgressRepoProvider).mark(
          meta.planId,
          meta.day,
          status: 'done',
          session: session,
        );
    await clearPlanSession(ref.read(prefsProvider), meta.planId, meta.day);
    if (meta.day < meta.totalDays) {
      await ref.read(planProgressRepoProvider).mark(
            meta.planId,
            meta.day + 1,
            status: 'active',
          );
    }
    widget.onPlanMetaChange?.call(null);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('今日计划已完成，可继续自由阅读')),
    );
  }

  Widget? _planSegmentFooter() {
    final meta = widget.planMeta;
    if (meta == null) return null;

    if (allStepsDone(meta.steps, meta.session.stepsDone)) {
      final prog = sessionProgress(meta.steps, meta.session.stepsDone);
      if (!_planDayFinishScheduled) {
        _planDayFinishScheduled = true;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _completePlanDay();
        });
      }
      return Container(
        margin: const EdgeInsets.only(top: 16, bottom: 8),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.goldWash,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.line),
        ),
        child: Text(
          '🎉 今日 ${prog.total} 段全部读完',
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        ),
      );
    }

    final idx = stepForChapter(meta.steps, widget.book.id, widget.chapter);
    if (idx < 0) return null;
    final step = meta.steps[idx];
    if (!isLastChapterOfStep(step, widget.chapter)) return null;
    final next = pendingNextStep(
      meta.steps,
      meta.session.stepsDone,
      widget.book.id,
      widget.chapter,
    );
    if (next == null) return null;
    return Container(
      margin: const EdgeInsets.only(top: 16, bottom: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.accentWash,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.accent),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('✓ ${step.label} 已读完',
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
          const SizedBox(height: 6),
          Text('下一段：${next.label}',
              style: const TextStyle(fontSize: 13, color: AppColors.inkSoft)),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _continuePlanSegment,
            style: FilledButton.styleFrom(backgroundColor: AppColors.accentDeep),
            child: Text('继续读 ${next.label} ›'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = ref.watch(readerExperienceThemeProvider);
    final verseNo = ref.watch(readerVerseNumberProvider);
    final async = widget.mainVersionId != null
        ? ref.watch(chapterVersionProvider((
            book: widget.book.id,
            chapter: widget.chapter,
            version: widget.mainVersionId!,
          )))
        : ref.watch(
            chapterProvider((book: widget.book.id, chapter: widget.chapter)));
    final highlights = ref.watch(highlightMapProvider).value ?? const {};
    final toggles = ref.watch(readerFeatureTogglesProvider);
    final pageTurn = ref.watch(readerPageTurnProvider);
    final fontFamily = ref.watch(readerFontFamilyProvider);
    final thoughtsByVerse = ref.watch(thoughtsByChapterProvider((
      book: widget.book.id,
      chapter: widget.chapter,
    )));
    final dictList = ref.watch(dictionaryProvider('')).value ?? const [];
    final dict = <String, DictEntity>{
      for (final e in dictList)
        if (e.name.length >= 2) e.name: e,
    };
    final outline = outlineFor(widget.book.id, widget.chapter);
    final sectionByVerse = {for (final s in outline) s.verse: s.title};
    final progress = bookProgressInBible(
        widget.books, widget.book.id, widget.chapter);
    final ctx = chapterContextInfo(widget.book.id, widget.chapter);
    final poetry = const {
      'PSA', 'PRO', 'ECC', 'SNG', 'LAM', 'AMO', 'MIC', 'HAB', 'ZEP', 'NAH',
      'HAG', 'ZEC', 'MAL', 'JOB',
    }.contains(widget.book.id.toUpperCase());

    final compareId =
        widget.mainVersionId == null ? widget.compareVersionId : null;
    final notesByVerse = ref.watch(notesStreamProvider).maybeWhen(
          data: (list) =>
              notesForChapter(list, widget.book.id, widget.chapter),
          orElse: () => const <int, List<Note>>{},
        );
    final compareAsync = compareId != null
        ? ref.watch(chapterVersionProvider((
            book: widget.book.id,
            chapter: widget.chapter,
            version: compareId,
          )))
        : null;
    final layoutAsync = widget.mainVersionId != null
        ? ref.watch(
            chapterProvider((book: widget.book.id, chapter: widget.chapter)))
        : null;

    Widget buildBody(Chapter ch, Chapter? compareCh, Chapter? layoutCh) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        widget.onRead(widget.book.id, widget.chapter);
        if (widget.mainVersionId == null) {
          writeChapterCache(
              ref.read(prefsProvider), widget.book.id, widget.chapter, ch);
        }
        if (!_resumeScheduled && _selected.isEmpty) {
          _resumeScheduled = true;
          _maybeResume();
        }
      });
      return _buildList(
        ch,
        theme,
        verseNo,
        dict,
        highlights,
        sectionByVerse,
        ctx,
        poetry,
        layoutChapter: layoutCh ?? ch,
        compareChapter: compareCh,
        notesByVerse: notesByVerse,
        underlinesEnabled: toggles.underlines,
        thoughtsEnabled: toggles.thoughts,
        thoughtsByVerse: thoughtsByVerse,
        pageTurn: pageTurn,
        fontFamily: fontFamily,
      );
    }

    return ColoredBox(
      color: theme.background,
      child: Stack(
        children: [
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 3,
              backgroundColor: Colors.black12,
              color: AppColors.accentDeep,
            ),
          ),
          Column(
            children: [
              Expanded(
                child: async.when(
                  loading: () {
                    if (_cachedChapter != null) {
                      return _buildList(
                        _cachedChapter!,
                        theme,
                        verseNo,
                        dict,
                        highlights,
                        sectionByVerse,
                        ctx,
                        poetry,
                        layoutChapter: _cachedChapter!,
                        compareChapter: null,
                        notesByVerse: notesByVerse,
                      );
                    }
                    return const Center(child: CircularProgressIndicator());
                  },
                  error: (e, _) => Center(child: Text('$e')),
                  data: (ch) {
                    final layoutCh = layoutAsync?.asData?.value;
                    if (compareAsync == null) return buildBody(ch, null, layoutCh);
                    return compareAsync.when(
                      loading: () => buildBody(ch, null, layoutCh),
                      error: (_, _) => buildBody(ch, null, layoutCh),
                      data: (ch2) => buildBody(ch, ch2, layoutCh),
                    );
                  },
                ),
              ),
            ],
          ),
          if (_selected.isNotEmpty)
            Positioned(
              top: _focusBarTop ??
                  (MediaQuery.of(context).size.height -
                      (widget.chromeHidden ? 140 : 200)),
              left: 12,
              right: 12,
              child: ReaderFocusBar(
                currentMark: toggles.underlines
                    ? _currentSelectionMark(highlights)
                    : null,
                underlinesEnabled: toggles.underlines,
                onLightAi: () => widget.onAskAi(
                    _refStr, _refLabel, _selectionText(async.value), false),
                onBookmark: _toggleBookmark,
                onCopy: () {
                  final t = _selectionText(async.value);
                  Clipboard.setData(
                      ClipboardData(text: '$_refLabel $t'));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                        content: Text('已复制'),
                        duration: Duration(milliseconds: 1200)),
                  );
                },
                onThought: () => _writeThought(async.value),
                onWriteNote: () => _promptMarkNote(_selectionRefStr),
                onPickColor: _pickHighlightColor,
                onClearMark: _clearHighlight,
                onClose: _clearSelection,
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildList(
    Chapter ch,
    ReaderExperienceTheme theme,
    ReaderVerseNumberMode verseNo,
    Map<String, DictEntity> dict,
    Map<String, HighlightMark> highlights,
    Map<int, String> sectionByVerse,
    ChapterContextInfo? ctx,
    bool poetry, {
    required Chapter layoutChapter,
    Chapter? compareChapter,
    Map<int, List<Note>> notesByVerse = const {},
    bool underlinesEnabled = true,
    bool thoughtsEnabled = true,
    Map<int, int> thoughtsByVerse = const {},
    ReaderPageTurn pageTurn = ReaderPageTurn.swipe,
    ReaderFontFamily fontFamily = ReaderFontFamily.serif,
  }) {
    if (compareChapter != null) {
      return _buildParallelList(
        layoutChapter,
        ch,
        compareChapter,
        theme,
        verseNo,
        ctx,
        poetry,
      );
    }

    final rows = <Object>[];
    final paras = groupVersesIntoParagraphs(
      widget.book.id,
      layoutChapter.verses,
      outlineFor(widget.book.id, widget.chapter).map((s) => s.verse).toList(),
    );
    for (final para in paras) {
      final t = sectionByVerse[para.startVerse];
      if (t != null) rows.add(t);
      rows.add(para);
    }

    VerseParagraph displayPara(VerseParagraph para) {
      if (identical(layoutChapter, ch)) return para;
      return VerseParagraph(
        startVerse: para.startVerse,
        endVerse: para.endVerse,
        verses: para.verses
            .map(
              (v) => ch.verses.firstWhere(
                (x) => x.verse == v.verse,
                orElse: () => v,
              ),
            )
            .toList(),
      );
    }

    final segmentFooter = _planSegmentFooter();
    final planHead = widget.planMeta != null ? 1 : 0;
    final planTail = segmentFooter != null ? 1 : 0;

    return GestureDetector(
      onHorizontalDragEnd: pageTurn == ReaderPageTurn.swipe
          ? (d) {
              widget.onInteract();
              final v = d.primaryVelocity ?? 0;
              if (v < -250) widget.onNav(1);
              if (v > 250) widget.onNav(-1);
            }
          : null,
      child: ListView.builder(
        controller: _scroll,
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
        itemCount: rows.length + 1 + planHead + planTail,
        itemBuilder: (_, i) {
          if (planHead == 1 && i == 0) {
            final meta = widget.planMeta!;
            final stepIdx = stepForChapter(
                meta.steps, widget.book.id, widget.chapter);
            return PlanReadingBar(
              planTitle: meta.planTitle,
              day: meta.day,
              totalDays: meta.totalDays,
              steps: meta.steps,
              session: meta.session,
              onJumpStep: (index) {
                final s = meta.steps[index];
                widget.onPlanJump?.call(s.bookId, s.chapterStart);
              },
              onOpenSheet: () => showPlanDaySheet(
                context,
                day: meta.day,
                steps: meta.steps,
                session: meta.session,
                currentStepIndex: stepIdx >= 0
                    ? stepIdx
                    : meta.session.currentStepIndex,
                onJump: (index) {
                  final s = meta.steps[index];
                  widget.onPlanJump?.call(s.bookId, s.chapterStart);
                },
              ),
            );
          }
          if (i == planHead) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  GestureDetector(
                    onTap: () => _showSummarySheet(
                      widget.book.name,
                      () => loadBookSummary(
                        ref,
                        ref.read(prefsProvider),
                        widget.book.id,
                        widget.book.name,
                      ),
                    ),
                    child: Text(widget.book.name,
                        style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            color: theme.ink)),
                  ),
                  const SizedBox(width: 10),
                  GestureDetector(
                    onTap: () => _showSummarySheet(
                      '${widget.book.name} · 第 ${widget.chapter} 章',
                      () => loadChapterSummary(
                        ref,
                        ref.read(prefsProvider),
                        widget.book.id,
                        widget.book.name,
                        widget.chapter,
                      ),
                    ),
                    child: Text('第 ${widget.chapter} 章',
                        style: TextStyle(
                            fontSize: 13,
                            color: theme.ink.withValues(alpha: 0.55))),
                  ),
                  const Spacer(),
                ],
              ),
            );
          }
          if (planTail == 1 && i == rows.length + 1 + planHead) {
            return segmentFooter!;
          }
          final r = rows[i - 1 - planHead];
          if (r is String) {
            return Padding(
              padding: const EdgeInsets.fromLTRB(0, 16, 0, 4),
              child: Text(r,
                  style: const TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w700,
                      color: _selected.isNotEmpty
                          ? AppColors.inkFaint.withValues(alpha: 0.45)
                          : AppColors.accentDeep)),
            );
          }
          final para = r as VerseParagraph;
          return _ParagraphBlock(
            book: widget.book,
            chapter: widget.chapter,
            paragraph: displayPara(para),
            verseNo: verseNo,
            poetry: poetry,
            selected: _selected,
            highlightMarks: highlights,
            underlinesEnabled: underlinesEnabled,
            thoughtsEnabled: thoughtsEnabled,
            thoughtsByVerse: thoughtsByVerse,
            notesByVerse: notesByVerse,
            fontFamily: fontFamily,
            selectionAnchorVerse: _selectionAnchorVerse,
            selectionAnchorKey: _selectionAnchorKey,
            resumeFlashVerse: _resumeFlashVerse,
            resumeAnchorKey: _resumeAnchorKey,
            onViewNote: _viewNote,
            onStart: _startSelect,
            onToggle: _toggleSelect,
            onOpenThoughts: _openThoughtsForVerse,
          );
        },
      ),
    );
  }

  Widget _buildParallelList(
    Chapter structure,
    Chapter primary,
    Chapter compare,
    ReaderExperienceTheme theme,
    ReaderVerseNumberMode verseNo,
    ChapterContextInfo? ctx,
    bool poetry,
  ) {
    final fontPx = ref.watch(readerFontProvider).px;
    final sectionByVerse = {
      for (final s in outlineFor(widget.book.id, widget.chapter)) s.verse: s.title
    };
    final paras = groupVersesIntoParagraphs(
      widget.book.id,
      structure.verses,
      outlineFor(widget.book.id, widget.chapter).map((s) => s.verse).toList(),
    );
    final rows = <Object>[];
    for (final para in paras) {
      final t = sectionByVerse[para.startVerse];
      if (t != null) rows.add(t);
      rows.add(para);
    }

    String verseText(Chapter ch, int verseNum) {
      return ch.verses
          .where((x) => x.verse == verseNum)
          .map((x) => x.text)
          .firstOrNull ??
          '—';
    }

    return GestureDetector(
      onHorizontalDragEnd: (d) {
        widget.onInteract();
        final v = d.primaryVelocity ?? 0;
        if (v < -250) widget.onNav(1);
        if (v > 250) widget.onNav(-1);
      },
      child: ListView.builder(
        controller: _scroll,
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
        itemCount: rows.length + 1,
        itemBuilder: (_, i) {
          if (i == 0) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: () => _showSummarySheet(
                      widget.book.name,
                      () => loadBookSummary(
                        ref,
                        ref.read(prefsProvider),
                        widget.book.id,
                        widget.book.name,
                      ),
                    ),
                    child: Text(widget.book.name,
                        style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            color: theme.ink)),
                  ),
                  const SizedBox(width: 10),
                  GestureDetector(
                    onTap: () => _showSummarySheet(
                      '${widget.book.name} · 第 ${widget.chapter} 章',
                      () => loadChapterSummary(
                        ref,
                        ref.read(prefsProvider),
                        widget.book.id,
                        widget.book.name,
                        widget.chapter,
                      ),
                    ),
                    child: Text('第 ${widget.chapter} 章',
                        style: TextStyle(
                            fontSize: 13,
                            color: theme.ink.withValues(alpha: 0.55))),
                  ),
                ],
              ),
            );
          }
          final r = rows[i - 1];
          if (r is String) {
            return Padding(
              padding: const EdgeInsets.fromLTRB(0, 16, 0, 4),
              child: Text(r,
                  style: const TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w700,
                      color: _selected.isNotEmpty
                          ? AppColors.inkFaint.withValues(alpha: 0.45)
                          : AppColors.accentDeep)),
            );
          }
          final para = r as VerseParagraph;
          final primarySpans = <InlineSpan>[];
          final compareSpans = <InlineSpan>[];
          final selBg = Paint()..color = AppColors.accentWash;
          for (final v in para.verses) {
            final isSel = _selected.contains(v.verse);
            if (verseNo != ReaderVerseNumberMode.hidden) {
              primarySpans.add(TextSpan(
                text: '${v.verse} ',
                style: TextStyle(
                  color: AppColors.accentDeep,
                  fontSize: fontPx * 0.65,
                  fontWeight: FontWeight.w700,
                  background: isSel ? selBg : null,
                ),
              ));
            }
            primarySpans.add(TextSpan(
              text: '${verseText(primary, v.verse)} ',
              style: isSel ? TextStyle(background: selBg) : null,
            ));
            if (verseNo != ReaderVerseNumberMode.hidden) {
              compareSpans.add(TextSpan(
                text: '${v.verse} ',
                style: TextStyle(
                  color: AppColors.accentDeep.withValues(alpha: 0.55),
                  fontSize: fontPx * 0.6,
                  fontWeight: FontWeight.w700,
                ),
              ));
            }
            compareSpans.add(TextSpan(text: '${verseText(compare, v.verse)} '));
          }
          return Container(
            margin: const EdgeInsets.symmetric(vertical: 4),
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                RichText(
                  textAlign: TextAlign.justify,
                  text: TextSpan(
                    style: TextStyle(
                      color: theme.ink,
                      fontSize: fontPx,
                      height: poetry ? 2.0 : 1.85,
                      fontFamily: 'Georgia',
                    ),
                    children: primarySpans,
                  ),
                ),
                const SizedBox(height: 6),
                RichText(
                  textAlign: TextAlign.justify,
                  text: TextSpan(
                    style: TextStyle(
                      color: theme.ink.withValues(alpha: 0.55),
                      fontSize: fontPx * 0.92,
                      height: 1.75,
                      fontFamily: 'Georgia',
                    ),
                    children: compareSpans,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _SummarySheet extends StatefulWidget {
  const _SummarySheet({required this.title, required this.load});
  final String title;
  final Future<String> Function() load;

  @override
  State<_SummarySheet> createState() => _SummarySheetState();
}

class _SummarySheetState extends State<_SummarySheet> {
  late Future<String> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.load();
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 12, 12, 24 + bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(widget.title,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 17,
                        color: AppColors.ink)),
              ),
              IconButton(
                icon: const Icon(Icons.close, color: AppColors.inkFaint),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 8),
          FutureBuilder<String>(
            future: _future,
            builder: (ctx, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(child: CircularProgressIndicator()),
                );
              }
              if (snap.hasError) {
                return Text('加载失败：${snap.error}',
                    style: const TextStyle(color: AppColors.inkSoft));
              }
              return Text(snap.data ?? '',
                  style: const TextStyle(
                      fontSize: 15, height: 1.75, color: AppColors.inkSoft));
            },
          ),
        ],
      ),
    );
  }
}

class _ParagraphBlock extends ConsumerStatefulWidget {
  const _ParagraphBlock({
    required this.book,
    required this.chapter,
    required this.paragraph,
    required this.verseNo,
    required this.poetry,
    required this.selected,
    required this.highlightMarks,
    required this.underlinesEnabled,
    required this.thoughtsEnabled,
    required this.thoughtsByVerse,
    required this.notesByVerse,
    required this.fontFamily,
    this.selectionAnchorVerse,
    this.selectionAnchorKey,
    this.resumeFlashVerse,
    this.resumeAnchorKey,
    required this.onViewNote,
    required this.onStart,
    required this.onToggle,
    required this.onOpenThoughts,
  });

  final BibleBook book;
  final int chapter;
  final VerseParagraph paragraph;
  final ReaderVerseNumberMode verseNo;
  final bool poetry;
  final Set<int> selected;
  final Map<String, HighlightMark> highlightMarks;
  final bool underlinesEnabled;
  final bool thoughtsEnabled;
  final Map<int, int> thoughtsByVerse;
  final Map<int, List<Note>> notesByVerse;
  final ReaderFontFamily fontFamily;
  final int? selectionAnchorVerse;
  final GlobalKey? selectionAnchorKey;
  final int? resumeFlashVerse;
  final GlobalKey? resumeAnchorKey;
  final void Function(Note note) onViewNote;
  final void Function(int verse) onStart;
  final void Function(int verse) onToggle;
  final void Function(int verse, String text) onOpenThoughts;

  @override
  ConsumerState<_ParagraphBlock> createState() => _ParagraphBlockState();
}

class _ParagraphBlockState extends ConsumerState<_ParagraphBlock> {
  final List<GestureRecognizer> _recognizers = [];

  void _clearRecognizers() {
    for (final r in _recognizers) {
      r.dispose();
    }
    _recognizers.clear();
  }

  @override
  void dispose() {
    _clearRecognizers();
    super.dispose();
  }

  GestureRecognizer _recognizerFor(int verse, bool selectionActive) {
    final GestureRecognizer r;
    if (selectionActive) {
      r = TapGestureRecognizer()..onTap = () => widget.onToggle(verse);
    } else {
      r = LongPressGestureRecognizer()
        ..onLongPress = () => widget.onStart(verse);
    }
    _recognizers.add(r);
    return r;
  }

  @override
  Widget build(BuildContext context) {
    _clearRecognizers();
    final fontPx = ref.watch(readerFontProvider).px;
    final selectionActive = widget.selected.isNotEmpty;
    final dimmedInk = AppColors.ink.withValues(alpha: 0.34);
    final baseStyle = TextStyle(
      color: AppColors.ink,
      fontSize: fontPx,
      height: widget.poetry ? 2.1 : 1.85,
      fontFamily: widget.fontFamily.fontFamily,
    );

    final spans = <InlineSpan>[];
    var hasThoughtLine = false;
    for (final v in widget.paragraph.verses) {
      final rec = _recognizerFor(v.verse, selectionActive);
      final isSel = widget.selected.contains(v.verse);
      final markInfo = widget.underlinesEnabled
          ? markForVerse(
              widget.highlightMarks, widget.book.id, widget.chapter, v.verse)
          : null;
      final mark = markInfo?.mark;
      if (widget.thoughtsEnabled &&
          (widget.thoughtsByVerse[v.verse] ?? 0) > 0) {
        hasThoughtLine = true;
      }

      final verseLabel = StringBuffer();
      if (widget.verseNo != ReaderVerseNumberMode.hidden) {
        verseLabel.write('${v.verse} ');
      }
      verseLabel.write('${v.text} ');

      TextStyle verseStyle = baseStyle;
      if (isSel) {
        // selection card handled below
      } else if (selectionActive) {
        verseStyle = baseStyle.copyWith(color: dimmedInk);
      } else if (mark != null) {
        verseStyle = applyHighlightStyle(baseStyle, mark: mark, disabled: false);
      }

      if (isSel) {
        final resumeFlash = widget.resumeFlashVerse == v.verse;
        spans.add(WidgetSpan(
          alignment: PlaceholderAlignment.baseline,
          baseline: TextBaseline.alphabetic,
          child: GestureDetector(
            onTap: selectionActive ? () => widget.onToggle(v.verse) : null,
            onLongPress:
                !selectionActive ? () => widget.onStart(v.verse) : null,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 320),
              key: v.verse == widget.selectionAnchorVerse
                  ? widget.selectionAnchorKey
                  : v.verse == widget.resumeFlashVerse
                      ? widget.resumeAnchorKey
                      : null,
              margin: const EdgeInsets.symmetric(horizontal: 1, vertical: 1),
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 3),
              decoration: BoxDecoration(
                color: resumeFlash
                    ? AppColors.accent.withValues(alpha: 0.28)
                    : AppColors.surface,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                    color: resumeFlash
                        ? AppColors.accentDeep.withValues(alpha: 0.55)
                        : AppColors.accent.withValues(alpha: 0.35)),
                boxShadow: resumeFlash
                    ? [
                        BoxShadow(
                          color: AppColors.accentDeep.withValues(alpha: 0.2),
                          blurRadius: 12,
                          spreadRadius: 1,
                        ),
                      ]
                    : [
                        BoxShadow(
                          color: AppColors.accentDeep.withValues(alpha: 0.12),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ],
              ),
              child: Text(
                verseLabel.toString(),
                style: baseStyle.copyWith(fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ));
      } else if (widget.resumeFlashVerse == v.verse) {
        spans.add(WidgetSpan(
          alignment: PlaceholderAlignment.baseline,
          baseline: TextBaseline.alphabetic,
          child: Container(
            key: widget.resumeAnchorKey,
            padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 1),
            decoration: BoxDecoration(
              color: AppColors.accent.withValues(alpha: 0.22),
              borderRadius: BorderRadius.circular(6),
              boxShadow: [
                BoxShadow(
                  color: AppColors.accentDeep.withValues(alpha: 0.18),
                  blurRadius: 10,
                ),
              ],
            ),
            child: Text(
              verseLabel.toString(),
              style: verseStyle,
            ),
          ),
        ));
      } else {
        spans.add(TextSpan(
          text: verseLabel.toString(),
          recognizer: rec,
          style: verseStyle,
        ));
      }

      final note = widget.notesByVerse[v.verse]?.firstOrNull;
      if (note != null) {
        spans.add(WidgetSpan(
          alignment: PlaceholderAlignment.middle,
          child: GestureDetector(
            onTap: () => widget.onViewNote(note),
            child: Padding(
              padding: const EdgeInsets.only(left: 1, right: 4),
              child: Icon(Icons.sticky_note_2_outlined,
                  size: 11,
                  color: selectionActive
                      ? AppColors.inkFaint
                      : AppColors.accentDeep.withValues(alpha: 0.55)),
            ),
          ),
        ));
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
          child: SelectionContainer.disabled(
            child: RichText(
              textAlign: TextAlign.justify,
              text: TextSpan(style: baseStyle, children: spans),
            ),
          ),
        ),
        if (widget.thoughtsEnabled && hasThoughtLine)
          GestureDetector(
            onTap: () {
              final v = widget.paragraph.verses.firstWhere(
                (x) => (widget.thoughtsByVerse[x.verse] ?? 0) > 0,
                orElse: () => widget.paragraph.verses.first,
              );
              widget.onOpenThoughts(v.verse, v.text);
            },
            child: Padding(
              padding: const EdgeInsets.only(left: 4, right: 4, bottom: 6),
              child: CustomPaint(
                painter: _DashedLinePainter(color: AppColors.accentDeep.withValues(alpha: 0.45)),
                child: const SizedBox(height: 1, width: double.infinity),
              ),
            ),
          ),
      ],
    );
  }
}

class _DashedLinePainter extends CustomPainter {
  _DashedLinePainter({required this.color});
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    const dash = 5.0;
    const gap = 4.0;
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.2;
    var x = 0.0;
    while (x < size.width) {
      canvas.drawLine(Offset(x, 0), Offset(x + dash, 0), paint);
      x += dash + gap;
    }
  }

  @override
  bool shouldRepaint(covariant _DashedLinePainter oldDelegate) =>
      oldDelegate.color != color;
}
