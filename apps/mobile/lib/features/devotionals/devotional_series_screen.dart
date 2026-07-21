/// 创世记 50 次同行专题页（经文 / 书信 / 教材 + 打卡）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../core/widgets/paper_card.dart';
import 'devotionals_repository.dart';

class DevotionalSeriesScreen extends ConsumerStatefulWidget {
  const DevotionalSeriesScreen({
    super.key,
    this.seriesId = genesis50SeriesId,
    this.initialDay,
  });

  final String seriesId;
  final int? initialDay;

  @override
  ConsumerState<DevotionalSeriesScreen> createState() =>
      _DevotionalSeriesScreenState();
}

class _DevotionalSeriesScreenState extends ConsumerState<DevotionalSeriesScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;
  late int _day;
  DevotionalDayDetail? _data;
  List<Map<String, dynamic>> _feed = const [];
  String? _err;
  bool _loading = true;
  bool _busy = false;
  bool _feedOpen = false;
  String _emoji = '🙏';
  final _checkinCtrl = TextEditingController();
  final _answers = <TextEditingController>[
    TextEditingController(),
    TextEditingController(),
  ];

  static const _emojiOptions = [
    ('🙏', '祷告'),
    ('❤️', '感恩'),
    ('👍', '认同'),
    ('🙌', '赞美'),
    ('💪', '愿意行动'),
  ];

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    _tabs.addListener(() {
      if (!_tabs.indexIsChanging) setState(() {});
    });
    final repo = ref.read(devotionalsRepositoryProvider);
    _day = widget.initialDay ?? repo.localDay(widget.seriesId);
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _tabs.dispose();
    _checkinCtrl.dispose();
    for (final c in _answers) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _err = null;
      _feedOpen = false;
    });
    try {
      final repo = ref.read(devotionalsRepositoryProvider);
      final detail = await repo.dayDetail(widget.seriesId, _day);
      final feed = await repo.feed(widget.seriesId, _day);
      await repo.saveProgress(widget.seriesId, _day);
      if (!mounted) return;
      setState(() {
        _data = detail;
        _feed = feed;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _err = '$e';
        _loading = false;
      });
    }
  }

  Future<void> _changeDay(int day) async {
    setState(() => _day = day);
    await _load();
  }

  Future<void> _openCheckinSheet() async {
    final data = _data;
    if (data == null) return;
    _emoji = data.myCheckinEmoji ?? '🙏';
    _checkinCtrl.text = data.myCheckinBody ?? '';
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 12,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
          ),
          child: StatefulBuilder(
            builder: (ctx, setLocal) {
              return Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    data.myCheckinEmoji != null ? '更新打卡' : '完成本次灵修',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '第$_day次 · ${data.bookName}第${data.chapter}章',
                    style: const TextStyle(color: AppColors.inkSoft, fontSize: 13),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final opt in _emojiOptions)
                        ChoiceChip(
                          label: Text('${opt.$1} ${opt.$2}'),
                          selected: _emoji == opt.$1,
                          onSelected: (_) => setLocal(() => _emoji = opt.$1),
                        ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _checkinCtrl,
                    maxLength: 120,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      hintText: '一句收获或祷告（可选）',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 8),
                  FilledButton(
                    onPressed: _busy
                        ? null
                        : () async {
                            Navigator.pop(ctx, true);
                          },
                    child: Text(_busy ? '发布中…' : '发布打卡'),
                  ),
                ],
              );
            },
          ),
        );
      },
    );
    if (ok == true) await _submitCheckin();
  }

  Future<void> _submitCheckin() async {
    final data = _data;
    if (data == null) return;
    setState(() => _busy = true);
    try {
      final repo = ref.read(devotionalsRepositoryProvider);
      await repo.checkin(
        widget.seriesId,
        _day,
        emoji: _emoji,
        body: _checkinCtrl.text.trim().isEmpty ? null : _checkinCtrl.text.trim(),
      );
      await _load();
      if (!mounted) return;
      final next = _day < (data.daysTotal) ? _day + 1 : null;
      await showModalBottomSheet<void>(
        context: context,
        builder: (ctx) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('第$_day次已完成',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                const SizedBox(height: 8),
                Text(
                  '这是你完成的第 ${_data?.myDays ?? data.myDays} 次',
                  style: const TextStyle(color: AppColors.inkSoft),
                ),
                const SizedBox(height: 14),
                if (next != null)
                  FilledButton(
                    onPressed: () {
                      Navigator.pop(ctx);
                      _changeDay(next);
                    },
                    child: Text('继续第 $next 次'),
                  ),
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('留在这一次'),
                ),
              ],
            ),
          ),
        ),
      );
      setState(() => _feedOpen = true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _onBottomPrimary() {
    if (_tabs.index == 0) {
      _tabs.animateTo(1);
      return;
    }
    if (_tabs.index == 1) {
      _tabs.animateTo(2);
      return;
    }
    _openCheckinSheet();
  }

  String get _bottomLabel {
    if (_tabs.index == 0) return '继续读灵修书信';
    if (_tabs.index == 1) return '进入默想与实践';
    final data = _data;
    if (data?.myCheckinEmoji != null) return '更新打卡 ${data!.myCheckinEmoji}';
    return '完成本次灵修';
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    return Scaffold(
      appBar: AppBar(
        title: Text(data?.seriesTitle ?? '与神同行 · 创世记'),
        actions: [
          TextButton(
            onPressed: () async {
              if (data == null) return;
              final picked = await showModalBottomSheet<int>(
                context: context,
                isScrollControlled: true,
                builder: (ctx) {
                  final checked = data.checkedDays.toSet();
                  final next = _day < data.daysTotal ? _day + 1 : null;
                  return DraggableScrollableSheet(
                    expand: false,
                    initialChildSize: 0.7,
                    builder: (_, controller) => ListView(
                      controller: controller,
                      children: [
                        const ListTile(
                          title: Text('选择第几次'),
                          subtitle: Text('可自由补读，不强制顺序'),
                        ),
                        if (next != null)
                          ListTile(
                            leading: const Icon(Icons.arrow_forward),
                            title: Text('继续第 $next 次'),
                            onTap: () => Navigator.pop(ctx, next),
                          ),
                        ...data.sessions.map((s) {
                          final d = (s['day'] as num?)?.toInt() ?? 0;
                          final title = '${s['title'] ?? ''}';
                          final done = checked.contains(d);
                          return ListTile(
                            leading: CircleAvatar(
                              backgroundColor: d == _day
                                  ? AppColors.gold
                                  : AppColors.surfaceSunken,
                              child: Text(
                                '$d',
                                style: TextStyle(
                                  color: d == _day ? Colors.white : AppColors.ink,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                            title: Text(title),
                            trailing: done
                                ? const Icon(Icons.check, color: AppColors.gold)
                                : null,
                            onTap: () => Navigator.pop(ctx, d),
                          );
                        }),
                      ],
                    ),
                  );
                },
              );
              if (picked != null) await _changeDay(picked);
            },
            child: Text('第$_day次'),
          ),
        ],
        bottom: TabBar(
          controller: _tabs,
          tabs: const [
            Tab(text: '经文'),
            Tab(text: '灵修书信'),
            Tab(text: '默想教材'),
          ],
        ),
      ),
      body: _loading && data == null
          ? const Center(child: CircularProgressIndicator())
          : _err != null && data == null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_err!),
                      TextButton(onPressed: _load, child: const Text('重试')),
                    ],
                  ),
                )
              : data == null
                  ? const SizedBox.shrink()
                  : Column(
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '第${data.day}次｜${data.title}',
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                '${data.bookName}第${data.chapter}章'
                                '${data.focusVerses != null ? ' · 重点 ${data.focusVerses}' : ''}',
                                style: const TextStyle(
                                  color: AppColors.inkSoft,
                                  fontSize: 13,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                '已完成 ${data.myDays}/${data.daysTotal}'
                                ' · ${data.participantsCount} 人正在同行'
                                '${data.todayCheckins > 0 ? ' · 今天 ${data.todayCheckins} 人已完成' : ''}',
                                style: const TextStyle(
                                  color: AppColors.inkFaint,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Expanded(
                          child: TabBarView(
                            controller: _tabs,
                            children: [
                              _ScriptureTab(data: data),
                              _LetterTab(data: data),
                              _WorkbookTab(data: data, answers: _answers),
                            ],
                          ),
                        ),
                        _FeedToggle(
                          open: _feedOpen,
                          dayCheckins: data.dayCheckins,
                          feed: _feed,
                          onToggle: () => setState(() => _feedOpen = !_feedOpen),
                        ),
                        SafeArea(
                          top: false,
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                            child: Row(
                              children: [
                                Expanded(
                                  child: FilledButton(
                                    onPressed: _busy ? null : _onBottomPrimary,
                                    child: Text(_bottomLabel),
                                  ),
                                ),
                                if (data.myCheckinEmoji != null &&
                                    _tabs.index == 2 &&
                                    _day < data.daysTotal) ...[
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: OutlinedButton(
                                      onPressed: () => _changeDay(_day + 1),
                                      child: Text('继续第 ${_day + 1} 次'),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
    );
  }
}

class _ScriptureTab extends StatelessWidget {
  const _ScriptureTab({required this.data});
  final DevotionalDayDetail data;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: () => context.push(
              '/reader?book=${data.book}&chapter=${data.chapter}',
            ),
            child: const Text('在圣经中打开 ›'),
          ),
        ),
        ...data.verses.map((v) {
          final verse = v['verse'];
          final text = '${v['text'] ?? ''}';
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text.rich(
              TextSpan(children: [
                TextSpan(
                  text: '$verse ',
                  style: const TextStyle(fontSize: 11, color: AppColors.inkSoft),
                ),
                TextSpan(
                  text: text,
                  style: const TextStyle(fontSize: 17, height: 1.7),
                ),
              ]),
            ),
          );
        }),
      ],
    );
  }
}

class _LetterTab extends StatelessWidget {
  const _LetterTab({required this.data});
  final DevotionalDayDetail data;

  @override
  Widget build(BuildContext context) {
    final paras = data.letterBody
        .split(RegExp(r'\n+'))
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('约 5 分钟阅读',
            style: TextStyle(color: AppColors.inkSoft, fontSize: 13)),
        const SizedBox(height: 10),
        ...paras.map((p) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(p, style: const TextStyle(height: 1.7, fontSize: 16)),
            )),
        PaperCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('我们一起祷告',
                  style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text(data.letterPrayer, style: const TextStyle(height: 1.6)),
            ],
          ),
        ),
      ],
    );
  }
}

class _WorkbookTab extends StatelessWidget {
  const _WorkbookTab({required this.data, required this.answers});
  final DevotionalDayDetail data;
  final List<TextEditingController> answers;

  @override
  Widget build(BuildContext context) {
    final wb = data.workbook;
    final questions = ((wb['questions'] as List?) ?? const [])
        .whereType<Map>()
        .map((e) => e.cast<String, dynamic>())
        .toList();
    final practices = ((wb['practices'] as List?) ?? const [])
        .map((e) => '$e')
        .toList();
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('答案会自动保存在本机',
            style: TextStyle(color: AppColors.inkFaint, fontSize: 12)),
        const SizedBox(height: 8),
        _section('今日重点', '${wb['today_focus'] ?? ''}'),
        _section('理性提问', '${wb['ancient_question'] ?? ''}'),
        _section('阅读提示', '${wb['ancient_hint'] ?? ''}'),
        _section('经文脉络', '${wb['passage_summary'] ?? ''}'),
        const Text('查考与默想',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
        const SizedBox(height: 8),
        for (var i = 0; i < questions.length; i++) ...[
          Text('${i + 1}. ${questions[i]['prompt'] ?? ''}'),
          const SizedBox(height: 6),
          TextField(
            controller: i < answers.length ? answers[i] : null,
            maxLines: 3,
            decoration: const InputDecoration(
              hintText: '用自己的话回答…',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 4),
          Text('默想提示：${questions[i]['hint'] ?? ''}',
              style: const TextStyle(color: AppColors.inkSoft, fontSize: 13)),
          const SizedBox(height: 14),
        ],
        _section('立约脉络', '${wb['covenant_thread'] ?? ''}'),
        const Text('今日实践',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
        const SizedBox(height: 8),
        ...practices.map((p) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Text('· $p'),
            )),
        const SizedBox(height: 12),
        PaperCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('今日祷告',
                  style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text('${wb['prayer'] ?? ''}', style: const TextStyle(height: 1.6)),
            ],
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _section(String title, String body) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          const SizedBox(height: 6),
          Text(body, style: const TextStyle(height: 1.65)),
        ],
      ),
    );
  }
}

class _FeedToggle extends StatelessWidget {
  const _FeedToggle({
    required this.open,
    required this.dayCheckins,
    required this.feed,
    required this.onToggle,
  });

  final bool open;
  final int dayCheckins;
  final List<Map<String, dynamic>> feed;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            dense: true,
            title: const Text('同行动态', style: TextStyle(fontWeight: FontWeight.w600)),
            trailing: Text(
              '$dayCheckins 人已完成 · ${open ? '收起' : '查看'}',
              style: const TextStyle(color: AppColors.inkSoft, fontSize: 12),
            ),
            onTap: onToggle,
          ),
          if (open)
            SizedBox(
              height: feed.isEmpty ? 40 : 72,
              child: feed.isEmpty
                  ? const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 16),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          '成为今天第一位留下回应的人。',
                          style: TextStyle(color: AppColors.inkSoft, fontSize: 13),
                        ),
                      ),
                    )
                  : ListView(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                      children: feed.take(8).map((item) {
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: Chip(
                            label: Text(
                              '${item['emoji'] ?? ''} ${item['mine'] == true ? '我' : (item['display_name'] ?? '')}',
                              style: const TextStyle(fontSize: 12),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
            ),
        ],
      ),
    );
  }
}
