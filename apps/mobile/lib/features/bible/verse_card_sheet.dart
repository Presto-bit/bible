/// 金句卡：风景底 + 经文 + 壁纸选择 + 分享（对齐 PWA VerseCardSheet）。
library;

import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api_client.dart' show prefsProvider;
import '../../core/daily_verse_wallpaper.dart';
import '../../core/theme.dart';

const _quoteSoftMax = 160;
const _wallpaperPrefKey = 'presto_verse_card_wallpaper_v1';

Future<void> showVerseCardSheet(
  BuildContext context, {
  required String refLabel,
  required String text,
  String versionLabel = '和合本',
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _VerseCardSheet(
      refLabel: refLabel,
      text: text,
      versionLabel: versionLabel,
    ),
  );
}

class _VerseCardSheet extends ConsumerStatefulWidget {
  const _VerseCardSheet({
    required this.refLabel,
    required this.text,
    required this.versionLabel,
  });

  final String refLabel;
  final String text;
  final String versionLabel;

  @override
  ConsumerState<_VerseCardSheet> createState() => _VerseCardSheetState();
}

class _VerseCardSheetState extends ConsumerState<_VerseCardSheet> {
  late int _wallpaperIndex;
  var _noteOpen = false;
  final _note = TextEditingController();
  final _posterKey = GlobalKey();

  String get _raw => widget.text.trim();
  bool get _truncated => _raw.characters.length > _quoteSoftMax;
  String get _quote {
    if (!_truncated) return _raw;
    return '${_raw.characters.take(_quoteSoftMax - 1)}…';
  }

  String get _posterVersion {
    final t = widget.versionLabel.trim();
    if (t.isEmpty) return '';
    return t.split(RegExp(r'[·•|/]')).first.trim();
  }

  String get _shareText {
    final noteLine = _note.text.trim();
    final body = StringBuffer()..writeln('「$_quote」');
    if (widget.refLabel.isNotEmpty) {
      body.writeln('—— ${widget.refLabel}');
    }
    if (_posterVersion.isNotEmpty) body.writeln(_posterVersion);
    if (noteLine.isNotEmpty) body.writeln(noteLine);
    body.write('彼爱 · 安静读经');
    return body.toString();
  }

  int _loadWallpaperIndex() {
    final n = dailyWallpaperFiles.length;
    if (n <= 0) return 0;
    final prefs = ref.read(prefsProvider);
    final raw = prefs.getInt(_wallpaperPrefKey);
    if (raw == null) {
      return widget.refLabel.hashCode.abs() % n;
    }
    return ((raw % n) + n) % n;
  }

  void _pickWallpaper(int i) {
    setState(() => _wallpaperIndex = i);
    ref.read(prefsProvider).setInt(_wallpaperPrefKey, i);
  }

  @override
  void initState() {
    super.initState();
    _wallpaperIndex = _loadWallpaperIndex();
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _share() async {
    final text = _shareText;
    try {
      final boundary = _posterKey.currentContext?.findRenderObject()
          as RenderRepaintBoundary?;
      if (boundary == null) {
        await SharePlus.instance.share(ShareParams(text: text));
        return;
      }
      final image = await boundary.toImage(pixelRatio: 3);
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      image.dispose();
      if (byteData == null) {
        await SharePlus.instance.share(ShareParams(text: text));
        return;
      }
      final dir = await getTemporaryDirectory();
      final file = File(
        '${dir.path}/peiai_verse_${DateTime.now().millisecondsSinceEpoch}.png',
      );
      await file.writeAsBytes(byteData.buffer.asUint8List());
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path, mimeType: 'image/png')],
          text: text,
        ),
      );
    } catch (_) {
      await SharePlus.instance.share(ShareParams(text: text));
    }
  }

  @override
  Widget build(BuildContext context) {
    final wall = dailyVerseWallpaperUrl(_wallpaperIndex + 1);
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Container(
      margin: EdgeInsets.fromLTRB(12, 0, 12, 12 + bottom),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.88,
      ),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
            child: Row(
              children: [
                const Text(
                  '金句卡',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                ),
                const Spacer(),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
          ),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: AspectRatio(
                      aspectRatio: 3 / 4,
                      child: RepaintBoundary(
                        key: _posterKey,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            Image.network(
                              wall,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => const ColoredBox(
                                color: Color(0xFF2C4034),
                              ),
                            ),
                            DecoratedBox(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [
                                    Colors.black.withValues(alpha: 0.3),
                                    Colors.black.withValues(alpha: 0.72),
                                  ],
                                ),
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.all(22),
                              child: Column(
                                children: [
                                  Row(
                                    children: [
                                      Text(
                                        '彼爱',
                                        style: TextStyle(
                                          color: Colors.white
                                              .withValues(alpha: 0.9),
                                          fontWeight: FontWeight.w700,
                                          fontSize: 14,
                                          letterSpacing: 1.5,
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Text(
                                        '金句',
                                        style: TextStyle(
                                          color: Colors.white
                                              .withValues(alpha: 0.55),
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                  ),
                                  const Spacer(),
                                  if (widget.refLabel.isNotEmpty)
                                    Text(
                                      widget.refLabel,
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        color: Colors.white
                                            .withValues(alpha: 0.88),
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  const SizedBox(height: 10),
                                  Text(
                                    _quote.isEmpty ? '（无经文）' : _quote,
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      fontFamily: 'Songti SC',
                                      fontFamilyFallback: const [
                                        'STSong',
                                        'Noto Serif SC',
                                        'serif'
                                      ],
                                      color: Colors.white,
                                      fontSize: _quote.characters.length > 100
                                          ? 15
                                          : _quote.characters.length > 60
                                              ? 17
                                              : 20,
                                      height: 1.6,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                  if (_note.text.trim().isNotEmpty) ...[
                                    const SizedBox(height: 12),
                                    Text(
                                      _note.text.trim(),
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        color: Colors.white
                                            .withValues(alpha: 0.75),
                                        fontSize: 13,
                                        height: 1.4,
                                      ),
                                    ),
                                  ],
                                  if (_posterVersion.isNotEmpty) ...[
                                    const SizedBox(height: 10),
                                    Text(
                                      _posterVersion,
                                      style: TextStyle(
                                        color: Colors.white
                                            .withValues(alpha: 0.6),
                                        fontSize: 11,
                                      ),
                                    ),
                                  ],
                                  const Spacer(),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  if (_truncated)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        '经文较长，海报将展示前 $_quoteSoftMax 字',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.inkFaint,
                        ),
                      ),
                    ),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 52,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: dailyWallpaperFiles.length.clamp(0, 12),
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (_, i) {
                        final active = i == _wallpaperIndex;
                        return GestureDetector(
                          onTap: () => _pickWallpaper(i),
                          child: Container(
                            width: 52,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: active
                                    ? AppColors.accentDeep
                                    : AppColors.line,
                                width: active ? 2 : 1,
                              ),
                              image: DecorationImage(
                                image: NetworkImage(
                                    dailyVerseWallpaperUrl(i + 1)),
                                fit: BoxFit.cover,
                                onError: (_, __) {},
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (_noteOpen)
                    TextField(
                      controller: _note,
                      maxLength: 40,
                      onChanged: (_) => setState(() {}),
                      decoration: const InputDecoration(
                        labelText: '附一句想法（可选，≤40 字）',
                        hintText: '今天这句话提醒我…',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                    )
                  else
                    TextButton(
                      onPressed: () => setState(() => _noteOpen = true),
                      child: const Text('加一句想法（可选）'),
                    ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () async {
                      final payload = widget.refLabel.isEmpty
                          ? _quote
                          : '${widget.refLabel}\n$_quote';
                      await Clipboard.setData(ClipboardData(text: payload));
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('经文已复制')),
                      );
                    },
                    child: const Text('复制'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: _quote.isEmpty ? null : _share,
                    style: FilledButton.styleFrom(
                        backgroundColor: AppColors.accentDeep),
                    child: const Text('生成并分享'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
