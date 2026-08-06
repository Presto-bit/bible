/// 每日经文回应：presets + feed + upsert，对齐 PWA DailyVerseReactSheet / API。
library;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';

class DailyVerseReactPreset {
  const DailyVerseReactPreset({
    required this.id,
    required this.kind,
    required this.emoji,
    required this.label,
    this.count,
  });

  final String id;
  final String kind;
  final String emoji;
  final String label;
  final int? count;

  factory DailyVerseReactPreset.fromJson(Map<String, dynamic> j) {
    return DailyVerseReactPreset(
      id: '${j['id'] ?? ''}',
      kind: '${j['kind'] ?? 'phrase'}',
      emoji: '${j['emoji'] ?? ''}',
      label: '${j['label'] ?? ''}',
      count: j['count'] is num ? (j['count'] as num).toInt() : null,
    );
  }

  String get displayLabel {
    if (emoji.isNotEmpty && label.isNotEmpty) return '$emoji $label';
    if (label.isNotEmpty) return label;
    return emoji;
  }
}

class DailyVerseReactFeedItem {
  const DailyVerseReactFeedItem({
    required this.userCode,
    required this.displayName,
    required this.preset,
    required this.createdAt,
  });

  final String userCode;
  final String displayName;
  final DailyVerseReactPreset preset;
  final String createdAt;

  factory DailyVerseReactFeedItem.fromJson(Map<String, dynamic> j) {
    final preset = j['preset'];
    return DailyVerseReactFeedItem(
      userCode: '${j['user_code'] ?? ''}',
      displayName: '${j['display_name'] ?? '读经伙伴'}',
      preset: preset is Map
          ? DailyVerseReactPreset.fromJson(Map<String, dynamic>.from(preset))
          : const DailyVerseReactPreset(
              id: '', kind: 'phrase', emoji: '', label: ''),
      createdAt: '${j['created_at'] ?? ''}',
    );
  }
}

/// 离线兜底（与 web `daily_verse_react_presets.ts` 对齐）。
const kFallbackReactEmojis = <DailyVerseReactPreset>[
  DailyVerseReactPreset(id: 'emoji:pray', kind: 'emoji', emoji: '🙏', label: '祷告'),
  DailyVerseReactPreset(id: 'emoji:heart', kind: 'emoji', emoji: '❤️', label: '喜爱'),
  DailyVerseReactPreset(id: 'emoji:dove', kind: 'emoji', emoji: '🕊️', label: '平安'),
  DailyVerseReactPreset(id: 'emoji:sparkle', kind: 'emoji', emoji: '✨', label: '光照'),
  DailyVerseReactPreset(id: 'emoji:sunrise', kind: 'emoji', emoji: '🌅', label: '盼望'),
  DailyVerseReactPreset(id: 'emoji:strong', kind: 'emoji', emoji: '💪', label: '力量'),
  DailyVerseReactPreset(id: 'emoji:hands', kind: 'emoji', emoji: '🤲', label: '仰望'),
  DailyVerseReactPreset(id: 'emoji:smile', kind: 'emoji', emoji: '😊', label: '喜乐'),
  DailyVerseReactPreset(id: 'emoji:tear', kind: 'emoji', emoji: '😢', label: '被触动'),
  DailyVerseReactPreset(id: 'emoji:fire', kind: 'emoji', emoji: '🔥', label: '火热'),
];

const kFallbackReactPhrases = <DailyVerseReactPreset>[
  DailyVerseReactPreset(id: 'phrase:amen', kind: 'phrase', emoji: '🙏', label: '阿们'),
  DailyVerseReactPreset(
      id: 'phrase:comfort', kind: 'phrase', emoji: '🕊️', label: '今日得安慰'),
  DailyVerseReactPreset(
      id: 'phrase:about_me', kind: 'phrase', emoji: '✨', label: '与我有关'),
  DailyVerseReactPreset(
      id: 'phrase:rely', kind: 'phrase', emoji: '🤲', label: '提醒我倚靠神'),
  DailyVerseReactPreset(
      id: 'phrase:strength', kind: 'phrase', emoji: '💪', label: '加添力量'),
  DailyVerseReactPreset(
      id: 'phrase:peace', kind: 'phrase', emoji: '🌅', label: '心里平安'),
  DailyVerseReactPreset(
      id: 'phrase:thanks', kind: 'phrase', emoji: '❤️', label: '感谢主'),
  DailyVerseReactPreset(
      id: 'phrase:obey', kind: 'phrase', emoji: '🔥', label: '愿意顺服'),
];

DailyVerseReactPreset? parseReactPreset(dynamic raw) {
  if (raw is! Map) return null;
  final p = DailyVerseReactPreset.fromJson(Map<String, dynamic>.from(raw));
  if (p.id.isEmpty && p.label.isEmpty) return null;
  return p;
}

class DailyVerseReactChange {
  const DailyVerseReactChange({
    required this.myReact,
    required this.reactsCount,
    required this.topPresets,
  });
  final DailyVerseReactPreset? myReact;
  final int reactsCount;
  final List<DailyVerseReactPreset> topPresets;
}

Future<void> showDailyVerseReactSheet({
  required BuildContext context,
  required WidgetRef ref,
  required int day,
  DailyVerseReactPreset? myReact,
  int reactsCount = 0,
  List<DailyVerseReactPreset> topPresets = const [],
  required void Function(DailyVerseReactChange next) onChanged,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.paper,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _DailyVerseReactSheetBody(
      day: day,
      myReact: myReact,
      reactsCount: reactsCount,
      topPresets: topPresets,
      onChanged: onChanged,
    ),
  );
}

class _DailyVerseReactSheetBody extends ConsumerStatefulWidget {
  const _DailyVerseReactSheetBody({
    required this.day,
    required this.myReact,
    required this.reactsCount,
    required this.topPresets,
    required this.onChanged,
  });

  final int day;
  final DailyVerseReactPreset? myReact;
  final int reactsCount;
  final List<DailyVerseReactPreset> topPresets;
  final void Function(DailyVerseReactChange next) onChanged;

  @override
  ConsumerState<_DailyVerseReactSheetBody> createState() =>
      _DailyVerseReactSheetBodyState();
}

class _DailyVerseReactSheetBodyState
    extends ConsumerState<_DailyVerseReactSheetBody> {
  late DailyVerseReactPreset? _mine = widget.myReact;
  late int _count = widget.reactsCount;
  late List<DailyVerseReactPreset> _top = List.of(widget.topPresets);
  List<DailyVerseReactPreset> _emojis = List.of(kFallbackReactEmojis);
  List<DailyVerseReactPreset> _phrases = List.of(kFallbackReactPhrases);
  List<DailyVerseReactFeedItem> _feed = const [];
  bool _loading = true;
  String? _busyId;
  String? _err;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _err = null;
    });
    final dio = ref.read(dioProvider);
    try {
      final res = await dio.get(
        '/content/daily-verse/reacts',
        queryParameters: {
          if (widget.day > 0) 'day': widget.day,
          'limit': 40,
        },
      );
      final data = res.data is Map
          ? Map<String, dynamic>.from(res.data as Map)
          : <String, dynamic>{};
      final items = <DailyVerseReactFeedItem>[];
      final rawItems = data['items'];
      if (rawItems is List) {
        for (final e in rawItems) {
          if (e is Map) {
            items.add(DailyVerseReactFeedItem.fromJson(
                Map<String, dynamic>.from(e)));
          }
        }
      }
      final emojis = _parseList(data['emojis']);
      final phrases = _parseList(data['phrases']);
      final top = _parseList(data['top_presets']);
      final mine = parseReactPreset(data['my_react']);
      final count = data['reacts_count'] is num
          ? (data['reacts_count'] as num).toInt()
          : _count;
      if (!mounted) return;
      setState(() {
        _feed = items;
        if (emojis.isNotEmpty) _emojis = emojis;
        if (phrases.isNotEmpty) _phrases = phrases;
        if (top.isNotEmpty) _top = top;
        _mine = mine;
        _count = count;
        _loading = false;
      });
      widget.onChanged(DailyVerseReactChange(
        myReact: mine,
        reactsCount: count,
        topPresets: top.isNotEmpty ? top : _top,
      ));
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _err = '暂时无法加载大家的回应';
      });
    }
  }

  List<DailyVerseReactPreset> _parseList(dynamic raw) {
    if (raw is! List) return const [];
    final out = <DailyVerseReactPreset>[];
    for (final e in raw) {
      if (e is Map) {
        final p =
            DailyVerseReactPreset.fromJson(Map<String, dynamic>.from(e));
        if (p.id.isNotEmpty) out.add(p);
      }
    }
    return out;
  }

  Future<void> _pick(DailyVerseReactPreset p) async {
    if (_busyId != null || widget.day < 1) return;
    setState(() {
      _busyId = p.id;
      _err = null;
    });
    final dio = ref.read(dioProvider);
    try {
      final res = await dio.post(
        '/content/daily-verse/react',
        queryParameters: {'day': widget.day},
        data: {'preset_id': p.id},
      );
      final data = res.data is Map
          ? Map<String, dynamic>.from(res.data as Map)
          : <String, dynamic>{};
      final mine = parseReactPreset(data['my_react']);
      final count = data['reacts_count'] is num
          ? (data['reacts_count'] as num).toInt()
          : _count;
      final top = _parseList(data['top_presets']);
      if (!mounted) return;
      setState(() {
        _mine = mine;
        _count = count;
        if (top.isNotEmpty) _top = top;
        _busyId = null;
      });
      widget.onChanged(DailyVerseReactChange(
        myReact: mine,
        reactsCount: count,
        topPresets: top.isNotEmpty ? top : _top,
      ));
      await _load();
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _busyId = null;
        _err = e.response?.statusCode == 401
            ? '请先登录后再回应'
            : '暂时无法回应，请稍后再试';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busyId = null;
        _err = '暂时无法回应，请稍后再试';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final maxH = MediaQuery.sizeOf(context).height * 0.78;
    return SafeArea(
      child: SizedBox(
        height: maxH,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.line,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      '今日回应',
                      style: TextStyle(
                          fontSize: 17, fontWeight: FontWeight.w700),
                    ),
                  ),
                  if (_count > 0)
                    Text(
                      '$_count 人',
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.inkFaint),
                    ),
                  IconButton(
                    tooltip: '关闭',
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close, size: 20),
                  ),
                ],
              ),
              Expanded(
                child: _loading && _feed.isEmpty
                    ? const Center(child: CircularProgressIndicator())
                    : _feed.isEmpty
                        ? _emptyState
                        : ListView.separated(
                            itemCount: _feed.length,
                            separatorBuilder: (_, __) =>
                                const Divider(height: 1),
                            itemBuilder: (_, i) {
                              final it = _feed[i];
                              return ListTile(
                                dense: true,
                                contentPadding: EdgeInsets.zero,
                                title: Text(
                                  it.displayName,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 14),
                                ),
                                subtitle: it.createdAt.isEmpty
                                    ? null
                                    : Text(
                                        it.createdAt,
                                        style: const TextStyle(
                                            fontSize: 11,
                                            color: AppColors.inkFaint),
                                      ),
                                trailing: Text(
                                  it.preset.displayLabel,
                                  style: const TextStyle(fontSize: 13),
                                ),
                              );
                            },
                          ),
              ),
              const SizedBox(height: 8),
              if (_mine != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(
                    '我已回应：${_mine!.displayLabel}（再次点击可取消）',
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.inkSoft),
                  ),
                ),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final p in _emojis)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(p.emoji, style: const TextStyle(fontSize: 18)),
                          selected: _mine?.id == p.id,
                          onSelected: _busyId != null
                              ? null
                              : (_) {
                                  _pick(p);
                                },
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final p in _phrases)
                    ActionChip(
                      avatar: Text(p.emoji),
                      label: Text(p.label),
                      backgroundColor: _mine?.id == p.id
                          ? AppColors.accentWash
                          : AppColors.surface,
                      onPressed:
                          _busyId != null ? null : () => _pick(p),
                    ),
                ],
              ),
              if (_err != null) ...[
                const SizedBox(height: 8),
                Text(_err!,
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.inkFaint)),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget get _emptyState => Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('🙏  ✨  ❤️  🕊️',
                  style: TextStyle(fontSize: 22, letterSpacing: 4)),
              const SizedBox(height: 10),
              Text(
                _mine != null ? '你已回应，等候更多伙伴加入' : '还没有人回应',
                style: const TextStyle(
                    fontWeight: FontWeight.w600, fontSize: 15),
              ),
              const SizedBox(height: 6),
              Text(
                _mine != null
                    ? '今天的回应已经送出，愿更多读经伙伴一起被经文触动。'
                    : '你可以做今天第一个回应的人。',
                textAlign: TextAlign.center,
                style: const TextStyle(
                    fontSize: 13, color: AppColors.inkFaint, height: 1.45),
              ),
            ],
          ),
        ),
      );
}
