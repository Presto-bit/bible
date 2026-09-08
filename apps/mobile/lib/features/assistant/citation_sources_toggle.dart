/// 折叠态「参考来源（N）」入口 + 列表 / 详情弹层（对齐 PWA CitationBar）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'assistant_repository.dart';
import 'citation_evidence_rail.dart';
import 'models.dart';

/// 默认折叠，显示参考数量；点击展开列表，再点条目看释义与摘录。
class CitationSourcesToggle extends StatelessWidget {
  const CitationSourcesToggle({
    super.key,
    required this.citations,
    this.bookName,
    this.onRecordClick,
  });

  final List<Citation> citations;
  final String? bookName;
  final VoidCallback? onRecordClick;

  List<Citation> get _items => uniqueCitationsForRail(citations);

  void _openList(BuildContext context) {
    onRecordClick?.call();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => _CitationListSheet(
        citations: _items,
        bookName: bookName,
        onPick: (c) {
          Navigator.of(ctx).pop();
          showCitationDetailSheet(context, citation: c);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final count = _items.length;
    if (count == 0) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Material(
          color: Color.lerp(AppColors.goldWash, Colors.white, 0.45) ??
              AppColors.goldWash,
          borderRadius: BorderRadius.circular(8),
          child: InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: () => _openList(context),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: AppColors.line.withValues(alpha: 0.9),
                ),
              ),
              child: Text(
                '参考来源（$count）',
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.inkSoft,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

void showCitationDetailSheet(
  BuildContext context, {
  required Citation citation,
}) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _CitationDetailSheet(citation: citation),
  );
}

class _CitationListSheet extends StatelessWidget {
  const _CitationListSheet({
    required this.citations,
    required this.onPick,
    this.bookName,
  });

  final List<Citation> citations;
  final String? bookName;
  final void Function(Citation c) onPick;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text(
                  '参考来源（${citations.length}）',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
                const Spacer(),
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('关闭'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: citations.length,
                separatorBuilder: (_, __) => const Divider(height: 1),
                itemBuilder: (_, i) {
                  final c = citations[i];
                  final title = formatCitationTitle(c.title, bookName: bookName);
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: '[${c.n}] ',
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              color: AppColors.accentDeep,
                            ),
                          ),
                          TextSpan(text: title),
                        ],
                      ),
                      style: const TextStyle(fontSize: 14),
                    ),
                    onTap: () => onPick(c),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CitationDetailSheet extends ConsumerStatefulWidget {
  const _CitationDetailSheet({required this.citation});
  final Citation citation;

  @override
  ConsumerState<_CitationDetailSheet> createState() =>
      _CitationDetailSheetState();
}

class _CitationDetailSheetState extends ConsumerState<_CitationDetailSheet> {
  String? _explain;
  String? _err;
  bool _loading = true;
  bool _snipExpanded = false;
  String _disclaimer = '以下中文为便于阅读的释义，非官方译本；请以圣经与原文摘录为准。';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final snip = widget.citation.snippet?.trim() ?? '';
    if (snip.isEmpty) {
      setState(() {
        _loading = false;
        _err = '暂无摘录内容';
      });
      return;
    }
    try {
      var res = await ref
          .read(assistantRepoProvider)
          .explainCitation(snippet: snip, title: widget.citation.title);
      if (res.explainZh.trim().isEmpty && res.error != null) {
        res = await ref.read(assistantRepoProvider).explainCitation(
              snippet: snip,
              title: widget.citation.title,
              force: true,
            );
      }
      if (!mounted) return;
      setState(() {
        _explain = res.explainZh;
        _disclaimer = res.disclaimer;
        _err = res.error;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _err = '暂无法生成中文释义';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final snip = widget.citation.snippet?.trim() ?? '';
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '[${widget.citation.n}] ${widget.citation.title}',
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                '中文释义',
                style: TextStyle(fontSize: 12, color: AppColors.inkFaint),
              ),
              const SizedBox(height: 6),
              if (_loading)
                const Text(
                  '正在生成释义…',
                  style: TextStyle(color: AppColors.inkFaint),
                )
              else if ((_explain ?? '').isNotEmpty)
                Text(
                  _explain!,
                  style: const TextStyle(height: 1.6, fontSize: 15),
                )
              else
                Text(
                  _err ?? '暂无法生成中文释义',
                  style: const TextStyle(color: AppColors.inkFaint),
                ),
              const SizedBox(height: 14),
              const Text(
                '原文摘录',
                style: TextStyle(fontSize: 12, color: AppColors.inkFaint),
              ),
              const SizedBox(height: 6),
              if (snip.isEmpty)
                const Text(
                  '暂无摘录内容',
                  style: TextStyle(color: AppColors.inkFaint),
                )
              else ...[
                Text(
                  snip,
                  maxLines: _snipExpanded ? null : 5,
                  overflow: _snipExpanded
                      ? TextOverflow.visible
                      : TextOverflow.ellipsis,
                  style: const TextStyle(height: 1.55, fontSize: 14),
                ),
                if (snip.length > 180)
                  TextButton(
                    onPressed: () =>
                        setState(() => _snipExpanded = !_snipExpanded),
                    child: Text(_snipExpanded ? '收起' : '展开更多'),
                  ),
              ],
              const SizedBox(height: 14),
              Text(
                _disclaimer,
                style: const TextStyle(
                  fontSize: 11,
                  height: 1.5,
                  color: AppColors.inkFaint,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
