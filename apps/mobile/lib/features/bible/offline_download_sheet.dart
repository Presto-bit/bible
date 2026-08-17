/// 离线经包下载管理（圣经 + 资料分包 Tab）。
/// 关闭 BottomSheet 不中断已开始的下载。主本：和合本 cuvs。
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../core/widgets/paper_card.dart';
import 'offline_bible.dart';
import 'offline_catalog.dart';
import 'offline_notice.dart' show offlineCardDismissedProvider;

Future<void> showOfflineDownloadSheet(BuildContext context, WidgetRef ref) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.72,
      maxChildSize: 0.92,
      builder: (_, scroll) => _OfflineDownloadBody(scrollController: scroll),
    ),
  );
}

class _OfflineDownloadBody extends ConsumerStatefulWidget {
  const _OfflineDownloadBody({required this.scrollController});
  final ScrollController scrollController;

  @override
  ConsumerState<_OfflineDownloadBody> createState() =>
      _OfflineDownloadBodyState();
}

class _OfflineDownloadBodyState extends ConsumerState<_OfflineDownloadBody> {
  int _tab = 0;
  late final OfflineBibleService _svc;
  final Map<String, bool> _installed = {};

  @override
  void initState() {
    super.initState();
    _svc = ref.read(offlineBibleProvider);
    _svc.addDownloadListener(_onDownloadTick);
    unawaited(_refreshInstalled());
  }

  @override
  void dispose() {
    _svc.removeDownloadListener(_onDownloadTick);
    super.dispose();
  }

  void _onDownloadTick() {
    if (mounted) setState(() {});
  }

  Future<void> _refreshInstalled() async {
    for (final item in offlineCatalog.where((e) => e.tab == 'bible')) {
      _installed[item.id] = await _svc.checkInstalled(item.id);
    }
    if (mounted) setState(() {});
  }

  bool _downloadable(String id) =>
      const {'cuvs', 'cnv', 'contemporary', 'kjv'}.contains(id);

  @override
  Widget build(BuildContext context) {
    final svc = ref.watch(offlineBibleProvider);
    final meta =
        svc.loadMeta(kPrimaryOfflineTranslation) ?? svc.loadMeta('cnv');
    final items = offlineCatalog
        .where((e) => e.tab == (_tab == 0 ? 'bible' : 'materials'))
        .toList();
    final busy = svc.isDownloading;
    final progress = svc.downloadProgress;
    final error = svc.downloadError;

    return SafeArea(
      child: ListView(
        controller: widget.scrollController,
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        children: [
          const Text(
            '离线下载',
            style: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 17,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            '主译本为和合本；关闭本页不会中断下载',
            style: TextStyle(fontSize: 12, color: AppColors.inkFaint),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              ChoiceChip(
                label: const Text('圣经'),
                selected: _tab == 0,
                onSelected: (_) => setState(() => _tab = 0),
                selectedColor: AppColors.accentWash,
              ),
              const SizedBox(width: 8),
              ChoiceChip(
                label: const Text('资料'),
                selected: _tab == 1,
                onSelected: (_) => setState(() => _tab = 1),
                selectedColor: AppColors.accentWash,
              ),
            ],
          ),
          if (meta != null) ...[
            const SizedBox(height: 8),
            Text(
              '经库版本 ${meta.version}',
              style: const TextStyle(fontSize: 12, color: AppColors.accentDeep),
            ),
          ],
          if (busy && progress != null) ...[
            const SizedBox(height: 12),
            LinearProgressIndicator(value: progress),
            const SizedBox(height: 6),
            Text(
              '正在下载 ${svc.downloadingId ?? ''}… ${(progress * 100).clamp(0, 100).toStringAsFixed(0)}%',
              style: const TextStyle(fontSize: 12, color: AppColors.inkFaint),
            ),
          ],
          if (error != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(error, style: const TextStyle(color: Colors.red)),
            ),
          const SizedBox(height: 12),
          ...items.map((item) {
            final ready = _installed[item.id] == true;
            final isDl = _downloadable(item.id);
            final thisBusy = busy && svc.downloadingId == item.id;
            final canDownload = isDl && !ready && !busy;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: PaperCard(
                tier: 1,
                tint: ready ? AppColors.accent : null,
                padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
                onTap: canDownload ? () => _download(item.id) : null,
                child: Row(
                  children: [
                    Icon(
                      ready
                          ? Icons.check_circle_outline
                          : (thisBusy
                                ? Icons.downloading_outlined
                                : Icons.menu_book_outlined),
                      color: ready ? AppColors.accentDeep : AppColors.inkSoft,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.name,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            item.id == kPrimaryOfflineTranslation
                                ? '主译本 · 无网时仍可继续读经'
                                : (ready ? '已可离线使用' : '按需下载，随时可删除'),
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.inkFaint,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    thisBusy
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(
                            ready
                                ? '已安装'
                                : isDl
                                ? '下载'
                                : '随经包',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: ready
                                  ? AppColors.accentDeep
                                  : AppColors.inkFaint,
                            ),
                          ),
                  ],
                ),
              ),
            );
          }),
          if (_tab == 0 &&
              (_installed[kPrimaryOfflineTranslation] == true ||
                  _installed['cnv'] == true))
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: OutlinedButton(
                onPressed: busy
                    ? null
                    : () => _delete(
                        _installed[kPrimaryOfflineTranslation] == true
                            ? kPrimaryOfflineTranslation
                            : 'cnv',
                      ),
                child: const Text('删除已装主离线包'),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _download(String id) async {
    final svc = ref.read(offlineBibleProvider);
    final future = svc.downloadPack(translationId: id);
    if (mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('已开始下载（$id），关闭页面后仍会继续')));
    }
    try {
      await future;
      await _refreshInstalled();
      ref.invalidate(offlineInstalledProvider);
      ref.read(offlineCardDismissedProvider.notifier).clear();
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('离线经包已就绪')));
      }
    } catch (_) {}
  }

  Future<void> _delete(String id) async {
    await ref.read(offlineBibleProvider).deletePack(id);
    await _refreshInstalled();
    ref.invalidate(offlineInstalledProvider);
    if (mounted) {
      setState(() {});
      Navigator.pop(context);
    }
  }
}
