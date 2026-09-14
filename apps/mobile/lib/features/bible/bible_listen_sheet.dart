/// AI 听经全屏播放面。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'bible_listen_controller.dart';
import 'models.dart';

Future<void> showBibleListenSheet(
  BuildContext context,
  WidgetRef ref, {
  required List<BibleBook> books,
  required BibleBook book,
  required int chapter,
  required String Function(String name) bookAbbr,
  required bool canPrevChapter,
  required bool canNextChapter,
  required Future<void> Function(int delta) onNavChapter,
  required Future<void> Function(BibleBook book, int chapter) onPickChapter,
}) async {
  final ctrl = ref.read(bibleListenProvider.notifier);
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.42),
    builder: (ctx) {
      return _BibleListenSheetBody(
        books: books,
        book: book,
        chapter: chapter,
        bookAbbr: bookAbbr,
        canPrevChapter: canPrevChapter,
        canNextChapter: canNextChapter,
        onNavChapter: onNavChapter,
        onPickChapter: onPickChapter,
      );
    },
  ).whenComplete(() {
    ctrl.closeSheet();
  });
}

class _BibleListenSheetBody extends ConsumerStatefulWidget {
  const _BibleListenSheetBody({
    required this.books,
    required this.book,
    required this.chapter,
    required this.bookAbbr,
    required this.canPrevChapter,
    required this.canNextChapter,
    required this.onNavChapter,
    required this.onPickChapter,
  });

  final List<BibleBook> books;
  final BibleBook book;
  final int chapter;
  final String Function(String name) bookAbbr;
  final bool canPrevChapter;
  final bool canNextChapter;
  final Future<void> Function(int delta) onNavChapter;
  final Future<void> Function(BibleBook book, int chapter) onPickChapter;

  @override
  ConsumerState<_BibleListenSheetBody> createState() =>
      _BibleListenSheetBodyState();
}

class _BibleListenSheetBodyState extends ConsumerState<_BibleListenSheetBody> {
  String _panel = 'none';
  bool _catalogOpen = false;
  String _locTab = 'chapters';
  late String _selectedBookId;
  final Map<int, GlobalKey> _verseKeys = {};
  int? _lastScrolledVerse;

  @override
  void initState() {
    super.initState();
    _selectedBookId = widget.book.id;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _scrollToVerse(ref.read(bibleListenProvider).currentVerse);
    });
  }

  @override
  void didUpdateWidget(covariant _BibleListenSheetBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.book.id != widget.book.id ||
        oldWidget.chapter != widget.chapter) {
      _selectedBookId = widget.book.id;
      _lastScrolledVerse = null;
      _verseKeys.clear();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _scrollToVerse(ref.read(bibleListenProvider).currentVerse);
      });
    }
  }

  GlobalKey _keyFor(int verse) =>
      _verseKeys.putIfAbsent(verse, GlobalKey.new);

  void _scrollToVerse(int? verse) {
    if (verse == null || verse == _lastScrolledVerse) return;
    _lastScrolledVerse = verse;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = _verseKeys[verse]?.currentContext;
      if (ctx == null || !mounted) return;
      Scrollable.ensureVisible(
        ctx,
        duration: const Duration(milliseconds: 280),
        alignment: 0.28,
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(bibleListenProvider);
    final ctrl = ref.read(bibleListenProvider.notifier);
    final verses = ctrl.verses;
    final preparing = session.ui == BibleListenUi.preparing;
    final playing = session.ui == BibleListenUi.playing;
    final errored = session.ui == BibleListenUi.error;
    ref.listen<int?>(
      bibleListenProvider.select((s) => s.currentVerse),
      (prev, next) {
        if (next == null) return;
        // 仅在真正换节时滚；忽略间隙误判造成的回跳已在 resolve 层消除
        _scrollToVerse(next);
      },
    );
    final maxMs = session.duration.inMilliseconds <= 0
        ? 1.0
        : session.duration.inMilliseconds.toDouble();
    final posMs = session.position.inMilliseconds
        .clamp(0, session.duration.inMilliseconds)
        .toDouble();
    final selectedBook = widget.books.firstWhere(
      (b) => b.id == _selectedBookId,
      orElse: () => widget.book,
    );
    final ot = widget.books
        .where((b) => b.testament.toUpperCase().startsWith('O'))
        .toList();
    final nt = widget.books
        .where((b) => !b.testament.toUpperCase().startsWith('O'))
        .toList();

    return FractionallySizedBox(
      heightFactor: 0.95,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color.lerp(AppColors.paper, AppColors.accent, 0.08)!,
              AppColors.surface,
            ],
          ),
          boxShadow: const [
            BoxShadow(
              color: Color(0x2E000000),
              blurRadius: 28,
              offset: Offset(0, -6),
            ),
          ],
        ),
        child: SafeArea(
          top: false,
          child: Stack(
            children: [
              Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(22, 10, 22, 4),
                    child: Column(
                      children: [
                        Center(
                          child: Container(
                            width: 36,
                            height: 4,
                            margin: const EdgeInsets.only(bottom: 10),
                            decoration: BoxDecoration(
                              color: AppColors.inkSoft.withValues(alpha: 0.35),
                              borderRadius: BorderRadius.circular(99),
                            ),
                          ),
                        ),
                        const Text(
                          '下滑可继续听',
                          textAlign: TextAlign.center,
                          style:
                              TextStyle(fontSize: 12, color: AppColors.inkSoft),
                        ),
                        const SizedBox(height: 6),
                        InkWell(
                          onTap: () => setState(() {
                            _catalogOpen = true;
                            _locTab = 'chapters';
                            _selectedBookId = widget.book.id;
                          }),
                          borderRadius: BorderRadius.circular(10),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Flexible(
                                  child: Text(
                                    '${session.bookName} ${session.chapter}',
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      fontSize: 20,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.ink,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 4),
                                const Text(
                                  '▾',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: AppColors.inkSoft,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          session.translationLabel,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.inkSoft,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: ClipRect(
                      child: verses.isEmpty
                        ? Center(
                            child: Text(
                              preparing ? '正在准备听读…' : '暂无经文',
                              style: const TextStyle(
                                fontSize: 15,
                                color: AppColors.inkSoft,
                              ),
                            ),
                          )
                        : ListView.builder(
                            padding: EdgeInsets.fromLTRB(
                              16,
                              4,
                              16,
                              MediaQuery.sizeOf(context).height * 0.38,
                            ),
                            itemCount: verses.length,
                            itemBuilder: (context, i) {
                              final v = verses[i];
                              final isCurrent = session.currentVerse == v.verse;
                              return Padding(
                                key: _keyFor(v.verse),
                                padding: const EdgeInsets.only(bottom: 2),
                                child: Material(
                                  color: isCurrent
                                      ? const Color(0xFF8EC8E8)
                                          .withValues(alpha: 0.38)
                                      : Colors.transparent,
                                  borderRadius: BorderRadius.circular(8),
                                  child: InkWell(
                                    borderRadius: BorderRadius.circular(8),
                                    onTap: !session.canSeek || preparing
                                        ? null
                                        : () => ctrl.seekVerse(v.verse),
                                    child: Padding(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 10,
                                        vertical: 5,
                                      ),
                                      child: Text.rich(
                                        TextSpan(
                                          children: [
                                            TextSpan(
                                              text: '${v.verse} ',
                                              style: TextStyle(
                                                fontSize: 12,
                                                fontWeight: FontWeight.w600,
                                                color: isCurrent
                                                    ? const Color(0xFF3D7EA8)
                                                    : AppColors.inkSoft,
                                              ),
                                            ),
                                            TextSpan(
                                              text: v.text,
                                              style: const TextStyle(
                                                fontSize: 16,
                                                height: 1.55,
                                                color: AppColors.ink,
                                                letterSpacing: 0.15,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                    ),
                  ),
                  Material(
                    color: AppColors.surface,
                    elevation: 6,
                    shadowColor: const Color(0x14000000),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(22, 8, 22, 16),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          SliderTheme(
                            data: SliderTheme.of(context).copyWith(
                              trackHeight: 3,
                              thumbShape: const RoundSliderThumbShape(
                                enabledThumbRadius: 7,
                              ),
                            ),
                            child: Slider(
                              value: posMs,
                              max: maxMs,
                              onChanged: !session.canSeek || preparing
                                  ? null
                                  : (v) => ctrl.seekMs(v.round()),
                            ),
                          ),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                formatListenTime(session.position),
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.inkSoft,
                                ),
                              ),
                              Text(
                                formatListenTime(session.duration),
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.inkSoft,
                                ),
                              ),
                            ],
                          ),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              IconButton(
                                onPressed:
                                    preparing || !widget.canPrevChapter
                                        ? null
                                        : () => widget.onNavChapter(-1),
                                icon: const Text(
                                  '‹‹',
                                  style: TextStyle(fontSize: 22),
                                ),
                              ),
                              const SizedBox(width: 18),
                              Material(
                                color: AppColors.accentDeep,
                                shape: const CircleBorder(),
                                elevation: 3,
                                child: InkWell(
                                  customBorder: const CircleBorder(),
                                  onTap: preparing
                                      ? null
                                      : () => ctrl.togglePlayPause(),
                                  child: SizedBox(
                                    width: 64,
                                    height: 64,
                                    child: Center(
                                      child: preparing
                                          ? const SizedBox(
                                              width: 22,
                                              height: 22,
                                              child:
                                                  CircularProgressIndicator(
                                                strokeWidth: 2.2,
                                                color: Colors.white,
                                              ),
                                            )
                                          : Text(
                                              playing ? '‖' : '▶',
                                              style: const TextStyle(
                                                color: Colors.white,
                                                fontSize: 24,
                                              ),
                                            ),
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 18),
                              IconButton(
                                onPressed:
                                    preparing || !widget.canNextChapter
                                        ? null
                                        : () => widget.onNavChapter(1),
                                icon: const Text(
                                  '››',
                                  style: TextStyle(fontSize: 22),
                                ),
                              ),
                            ],
                          ),
                          Text(
                            preparing
                                ? '正在准备'
                                : (errored
                                    ? (session.error ?? '准备失败，点按重试')
                                    : ' '),
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 12,
                              color: errored
                                  ? const Color(0xFFA0483A)
                                  : AppColors.inkSoft,
                            ),
                          ),
                          Wrap(
                            alignment: WrapAlignment.center,
                            spacing: 8,
                            runSpacing: 6,
                            children: [
                              _chip(
                                label: '语速 ${session.settings.speed}×',
                                on: _panel == 'speed',
                                onTap: () => setState(
                                  () => _panel =
                                      _panel == 'speed' ? 'none' : 'speed',
                                ),
                              ),
                              _chip(
                                label: '沉稳男声',
                                on: false,
                                onTap: null,
                              ),
                              _chip(
                                label: session.settings.sleepMinutes == null
                                    ? '定时'
                                    : '定时 ${session.settings.sleepMinutes}′',
                                on: _panel == 'sleep',
                                onTap: () => setState(
                                  () => _panel =
                                      _panel == 'sleep' ? 'none' : 'sleep',
                                ),
                              ),
                            ],
                          ),
                          if (_panel == 'speed')
                            Wrap(
                              alignment: WrapAlignment.center,
                              spacing: 8,
                              children: [0.8, 1.0, 1.25, 1.5].map((s) {
                                return _chip(
                                  label: '$s×',
                                  on: session.settings.speed == s,
                                  onTap: () {
                                    ctrl.updateSettings(
                                      session.settings.copyWith(speed: s),
                                    );
                                    setState(() => _panel = 'none');
                                  },
                                );
                              }).toList(),
                            ),
                          if (_panel == 'sleep')
                            Wrap(
                              alignment: WrapAlignment.center,
                              spacing: 8,
                              children: [
                                (null, '关'),
                                (15, '15 分'),
                                (30, '30 分'),
                                (60, '60 分'),
                              ].map((e) {
                                final minutes = e.$1;
                                return _chip(
                                  label: e.$2,
                                  on: session.settings.sleepMinutes == minutes,
                                  onTap: () {
                                    ctrl.armSleep(minutes);
                                    setState(() => _panel = 'none');
                                  },
                                );
                              }).toList(),
                            ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
              if (_catalogOpen)
                Positioned.fill(
                  child: Material(
                    color: AppColors.surface,
                    borderRadius:
                        const BorderRadius.vertical(top: Radius.circular(22)),
                    child: SafeArea(
                      top: false,
                      child: Column(
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 14, 12, 8),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    selectedBook.name,
                                    style: const TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                                TextButton(
                                  onPressed: () =>
                                      setState(() => _catalogOpen = false),
                                  child: const Text('关闭'),
                                ),
                              ],
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            child: Row(
                              children: [
                                _seg(
                                  '卷',
                                  _locTab == 'books',
                                  () => setState(() => _locTab = 'books'),
                                ),
                                const SizedBox(width: 8),
                                _seg(
                                  '章',
                                  _locTab == 'chapters',
                                  () => setState(() => _locTab = 'chapters'),
                                ),
                              ],
                            ),
                          ),
                          Expanded(
                            child: _locTab == 'chapters'
                                ? GridView.builder(
                                    padding: const EdgeInsets.all(16),
                                    gridDelegate:
                                        const SliverGridDelegateWithFixedCrossAxisCount(
                                      crossAxisCount: 5,
                                      mainAxisSpacing: 8,
                                      crossAxisSpacing: 8,
                                    ),
                                    itemCount: selectedBook.chapterCount,
                                    itemBuilder: (context, i) {
                                      final n = i + 1;
                                      final current =
                                          selectedBook.id == widget.book.id &&
                                              n == widget.chapter;
                                      return Material(
                                        color: current
                                            ? AppColors.accent
                                                .withValues(alpha: 0.15)
                                            : AppColors.paper,
                                        shape: RoundedRectangleBorder(
                                          borderRadius:
                                              BorderRadius.circular(10),
                                          side: BorderSide(
                                            color: current
                                                ? AppColors.accentDeep
                                                : AppColors.line,
                                          ),
                                        ),
                                        child: InkWell(
                                          borderRadius:
                                              BorderRadius.circular(10),
                                          onTap: () async {
                                            await widget.onPickChapter(
                                              selectedBook,
                                              n,
                                            );
                                            if (mounted) {
                                              setState(
                                                () => _catalogOpen = false,
                                              );
                                            }
                                          },
                                          child: Center(
                                            child: Text(
                                              '$n',
                                              style: TextStyle(
                                                fontWeight: current
                                                    ? FontWeight.w700
                                                    : FontWeight.w500,
                                              ),
                                            ),
                                          ),
                                        ),
                                      );
                                    },
                                  )
                                : ListView(
                                    padding: const EdgeInsets.all(16),
                                    children: [
                                      _bookGroup('旧约', ot),
                                      _bookGroup('新约', nt),
                                    ],
                                  ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _seg(String label, bool on, VoidCallback onTap) {
    return Expanded(
      child: Material(
        color: on
            ? AppColors.accent.withValues(alpha: 0.12)
            : AppColors.surfaceSunken,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: on ? AppColors.accentDeep : AppColors.inkSoft,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _bookGroup(String label, List<BibleBook> list) {
    if (list.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              color: AppColors.inkSoft,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: list.map((b) {
              final on = b.id == _selectedBookId;
              return Material(
                color: on
                    ? AppColors.accent.withValues(alpha: 0.12)
                    : AppColors.paper,
                shape: StadiumBorder(
                  side: BorderSide(
                    color: on ? AppColors.accentDeep : AppColors.line,
                  ),
                ),
                child: InkWell(
                  customBorder: const StadiumBorder(),
                  onTap: () => setState(() {
                    _selectedBookId = b.id;
                    _locTab = 'chapters';
                  }),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                    child: Text(widget.bookAbbr(b.name)),
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _chip({
    required String label,
    required bool on,
    required VoidCallback? onTap,
  }) {
    return Material(
      color: on
          ? AppColors.accent.withValues(alpha: 0.12)
          : AppColors.surface.withValues(alpha: 0.7),
      shape: StadiumBorder(
        side: BorderSide(
          color: on
              ? AppColors.accentDeep.withValues(alpha: 0.35)
              : AppColors.line,
        ),
      ),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: on ? AppColors.accentDeep : AppColors.inkSoft,
            ),
          ),
        ),
      ),
    );
  }
}
