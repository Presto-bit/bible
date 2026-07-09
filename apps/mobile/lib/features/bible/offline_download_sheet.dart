/// 离线经包下载管理（圣经 + 资料分包 Tab）。
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
  double? _progress;
  bool _busy = false;
  String? _error;
  String? _busyItem;

  @override
  Widget build(BuildContext context) {
    final installed = ref.watch(offlineInstalledProvider);
    final meta = ref.read(offlineBibleProvider).loadMeta();
    final items = offlineCatalog
        .where((e) => e.tab == (_tab == 0 ? 'bible' : 'materials'))
        .toList();

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
          if (_progress != null) ...[
            const SizedBox(height: 12),
            LinearProgressIndicator(value: _progress),
          ],
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
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
              trailing: _busyItem == item.id
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
              onTap: item.id == 'cnv' && !ready && !_busy
                  ? () => _downloadCnv()
                  : null,
            );
          }),
          if (_tab == 0 && installed.maybeWhen(data: (v) => v, orElse: () => false))
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: OutlinedButton(
                onPressed: _busy ? null : () => _delete(),
                child: const Text('删除 CNV 离线包'),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _downloadCnv() async {
    setState(() {
      _busy = true;
      _busyItem = 'cnv';
      _error = null;
      _progress = 0;
    });
    try {
      await ref.read(offlineBibleProvider).downloadPack(
            onProgress: (p) => setState(() => _progress = p),
          );
      ref.invalidate(offlineInstalledProvider);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _busyItem = null;
        });
      }
    }
  }

  Future<void> _delete() async {
    setState(() => _busy = true);
    await ref.read(offlineBibleProvider).deletePack();
    ref.invalidate(offlineInstalledProvider);
    if (mounted) {
      setState(() => _busy = false);
      Navigator.pop(context);
    }
  }
}
