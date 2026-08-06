/// 译本对照半屏：对齐 PWA VerseCompareSheet 核心（`/bible/compare`）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'bible_repository.dart';

Future<void> showVerseCompareSheet(
  BuildContext context, {
  required String refParam,
  required String refLabel,
  String? selectionText,
  VoidCallback? onOpenChapterParallel,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.62,
      maxChildSize: 0.9,
      builder: (_, scroll) => _VerseCompareBody(
        refParam: refParam,
        refLabel: refLabel,
        selectionText: selectionText,
        onOpenChapterParallel: onOpenChapterParallel,
        scrollController: scroll,
      ),
    ),
  );
}

bool _hasVerseRef(String refParam) {
  return RegExp(r'\.\d+\.\d+').hasMatch(refParam) ||
      RegExp(r':\d+\s*$').hasMatch(refParam) ||
      RegExp(r':\d+[-–]').hasMatch(refParam);
}

class _VerseCompareBody extends ConsumerStatefulWidget {
  const _VerseCompareBody({
    required this.refParam,
    required this.refLabel,
    this.selectionText,
    this.onOpenChapterParallel,
    required this.scrollController,
  });

  final String refParam;
  final String refLabel;
  final String? selectionText;
  final VoidCallback? onOpenChapterParallel;
  final ScrollController scrollController;

  @override
  ConsumerState<_VerseCompareBody> createState() => _VerseCompareBodyState();
}

class _VerseCompareBodyState extends ConsumerState<_VerseCompareBody> {
  late Future<List<VerseRendition>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<VerseRendition>> _load() {
    if (!_hasVerseRef(widget.refParam)) {
      return Future.error(StateError('请选中具体经节后再打开对照'));
    }
    return ref.read(bibleRepoProvider).compare(widget.refParam);
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        '译本对照',
                        style: TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 16),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        widget.refLabel,
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.inkFaint),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            if (widget.selectionText != null &&
                widget.selectionText!.trim().isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                '「${widget.selectionText!.trim()}」',
                style: const TextStyle(
                  fontSize: 14,
                  height: 1.55,
                  color: AppColors.inkSoft,
                  fontFamily: 'Songti SC',
                  fontFamilyFallback: ['STSong', 'Noto Serif SC', 'serif'],
                ),
              ),
            ],
            const SizedBox(height: 12),
            Expanded(
              child: FutureBuilder<List<VerseRendition>>(
                future: _future,
                builder: (context, snap) {
                  if (snap.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  if (snap.hasError) {
                    return Center(
                      child: Text(
                        '${snap.error}'.replaceFirst('Bad state: ', ''),
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: AppColors.inkSoft),
                      ),
                    );
                  }
                  final rows = snap.data ?? const [];
                  if (rows.isEmpty) {
                    return const Center(
                      child: Text('暂无对照译本',
                          style: TextStyle(color: AppColors.inkFaint)),
                    );
                  }
                  return ListView.separated(
                    controller: widget.scrollController,
                    itemCount: rows.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (_, i) {
                      final r = rows[i];
                      return Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceSunken,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.line),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              r.label.isNotEmpty
                                  ? r.label
                                  : r.version.toUpperCase(),
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: AppColors.accentDeep,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              r.text,
                              style: const TextStyle(
                                fontSize: 15,
                                height: 1.65,
                                color: AppColors.ink,
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  );
                },
              ),
            ),
            if (widget.onOpenChapterParallel != null) ...[
              const SizedBox(height: 8),
              TextButton(
                onPressed: () {
                  Navigator.pop(context);
                  widget.onOpenChapterParallel!();
                },
                child: const Text('整章上下对照 ›'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
