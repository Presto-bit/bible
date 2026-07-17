/// 离线经包下载管理（圣经 + 资料分包 Tab）。
/// 关闭 BottomSheet 不中断已开始的下载。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'offline_bible.dart';
import 'offline_catalog.dart';

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

  @override
  void initState() {
    super.initState();
    _svc = ref.read(offlineBibleProvider);
    _svc.addDownloadListener(_onDownloadTick);
  }

  @override
  void dispose() {
    _svc.removeDownloadListener(_onDownloadTick);
    super.dispose();
  }

  void _onDownloadTick() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final svc = ref.watch(offlineBibleProvider);
    final installed = ref.watch(offlineInstalledProvider);
    final meta = svc.loadMeta();
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
          const Text('离线下载',
              style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 17,
                  color: AppColors.ink)),
          const SizedBox(height: 8),
          const Text('关闭本页不会中断下载',
              style: TextStyle(fontSize: 12, color: AppColors.inkFaint)),
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
            Text('经库版本 ${meta.version}',
                style: const TextStyle(fontSize: 12, color: AppColors.accentDeep)),
          ],
          if (busy && progress != null) ...[
            const SizedBox(height: 12),
            LinearProgressIndicator(value: progress),
            const SizedBox(height: 6),
            Text('正在后台下载… ${(progress * 100).clamp(0, 100).toStringAsFixed(0)}%',
                style: const TextStyle(fontSize: 12, color: AppColors.inkFaint)),
          ],
          if (error != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(error, style: const TextStyle(color: Colors.red)),
            ),
          const SizedBox(height: 12),
          ...items.map((item) {
            final ready = installed.maybeWhen(
              data: (v) => v && item.id == 'cnv',
              orElse: () => false,
            );
            return ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(item.name),
              subtitle: item.description != null ? Text(item.description!) : null,
              trailing: busy && item.id == 'cnv'
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(
                      ready
                          ? '已安装'
                          : item.kind == 'bundle'
                              ? '随经包'
                              : '下载',
                      style: TextStyle(
                          fontSize: 12,
                          color: ready
                              ? AppColors.accentDeep
                              : AppColors.inkFaint),
                    ),
              onTap: item.id == 'cnv' && !ready && !busy
                  ? () => _downloadCnv()
                  : null,
            );
          }),
          if (_tab == 0 && installed.maybeWhen(data: (v) => v, orElse: () => false))
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: OutlinedButton(
                onPressed: busy ? null : () => _delete(),
                child: const Text('删除 CNV 离线包'),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _downloadCnv() async {
    final svc = ref.read(offlineBibleProvider);
    // 不 await 到结束再 pop：关闭 Sheet 后 Service 仍继续下载
    final future = svc.downloadPack();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('已开始下载，关闭页面后仍会继续')),
      );
    }
    try {
      await future;
      ref.invalidate(offlineInstalledProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('离线经包已就绪')),
        );
      }
    } catch (_) {
      // 错误由 svc.downloadError + listener 展示
    }
  }

  Future<void> _delete() async {
    await ref.read(offlineBibleProvider).deletePack();
    ref.invalidate(offlineInstalledProvider);
    if (mounted) {
      setState(() {});
      Navigator.pop(context);
    }
  }
}
