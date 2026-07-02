/// 小爱问答页：流式释经 + 多轮 + 脚注引用 + 游客限额提示。
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:speech_to_text/speech_to_text.dart';

import '../../app/app_shell.dart';
import '../../core/database/app_database.dart';
import '../../core/theme.dart';
import 'answer_text.dart';
import 'assistant_seed.dart';
import 'assistant_repository.dart';
import 'models.dart';
import 'session_repository.dart';

// 从回答末尾解析【相关追问】列表，供渲染可点击的追问 chip。
List<String> followupsOf(String text) {
  final idx = text.indexOf(RegExp(r'[【\[]?\s*相关追问\s*[】\]]?[:：]?'));
  if (idx < 0) return const [];
  final tail = text.substring(idx).split('\n').skip(1);
  final out = <String>[];
  final re = RegExp(r'^\s*(?:[-*•]|\d+[.)、])\s*(.+?)\s*$');
  for (final line in tail) {
    final m = re.firstMatch(line);
    if (m != null && (m.group(1) ?? '').isNotEmpty) {
      out.add(m.group(1)!.replaceAll(RegExp(r'^["“]|["”]$'), '').trim());
    }
  }
  return out.take(3).toList();
}

// 复制/分享时去掉末尾相关追问段落，只保留正文。
String stripFollowups(String text) {
  final idx = text.indexOf(RegExp(r'\n[ \t]*(?:【相关追问】|\[相关追问\]|相关追问\s*[:：])'));
  return idx >= 0 ? text.substring(0, idx).trim() : text.trim();
}

class AssistantScreen extends ConsumerStatefulWidget {
  const AssistantScreen({super.key, this.seedRef, this.seedQuestion});

  /// 从经文页进入时带入的引用（如 JHN.3.16）。
  final String? seedRef;
  final String? seedQuestion;

  @override
  ConsumerState<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends ConsumerState<AssistantScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final List<ChatTurn> _turns = [];
  AssistantMode _mode = AssistantMode.understand;
  bool _streaming = false;
  ChatMeta? _lastMeta;
  String? _anchorRef;
  String? _sessionId;

  @override
  void initState() {
    super.initState();
    _anchorRef = widget.seedRef;
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  Future<void> _bootstrap() async {
    final repo = ref.read(sessionRepoProvider);
    final hasSeed = (widget.seedRef ?? '').isNotEmpty ||
        (widget.seedQuestion ?? '').isNotEmpty;
    if (hasSeed) {
      // 经文页进入：开一个锚定新会话并直接提问。
      _sessionId = await repo.createSession(anchorRef: widget.seedRef);
      if (!mounted) return;
      await _send(seedQuestion: widget.seedQuestion);
      return;
    }
    // Tab 进入：续接最近一个会话（若有）。
    final sessions = await repo.watchSessions().first;
    if (sessions.isNotEmpty) {
      await _loadSession(sessions.first);
    }
  }

  Future<void> _loadSession(AiSession s) async {
    final repo = ref.read(sessionRepoProvider);
    final msgs = await repo.watchMessages(s.id).first;
    if (!mounted) return;
    setState(() {
      _sessionId = s.id;
      _anchorRef = s.anchorRef;
      _turns
        ..clear()
        ..addAll(msgs.map((m) {
          final t = ChatTurn(role: m.role, content: m.content);
          final cites = citationsFromJson(m.citationsJson);
          if (cites.isNotEmpty) {
            t.meta = ChatMeta(
              mode: '',
              modeLabel: '',
              display: '',
              citations: cites,
              quotaUsed: 0,
              quotaLimit: 0,
            );
          }
          return t;
        }));
    });
    _autoScroll();
  }

  void _newSession() {
    setState(() {
      _sessionId = null;
      _anchorRef = null;
      _turns.clear();
      _lastMeta = null;
    });
  }

  Future<void> _openHistory() async {
    // 从左往右弹出抽屉，覆盖约 30% 屏宽。
    final selected = await showGeneralDialog<AiSession>(
      context: context,
      barrierDismissible: true,
      barrierLabel: '历史会话',
      barrierColor: Colors.black.withValues(alpha: 0.35),
      transitionDuration: const Duration(milliseconds: 220),
      pageBuilder: (_, __, ___) {
        final w = MediaQuery.of(context).size.width;
        final drawerW = (w * 0.3).clamp(240.0, 360.0);
        return Align(
          alignment: Alignment.centerLeft,
          child: SizedBox(
            width: drawerW,
            height: double.infinity,
            child: Material(
              color: AppColors.surface,
              child: SafeArea(child: _SessionListSheet(onNew: _newSession)),
            ),
          ),
        );
      },
      transitionBuilder: (_, anim, __, child) => SlideTransition(
        position: Tween<Offset>(begin: const Offset(-1, 0), end: Offset.zero)
            .animate(CurvedAnimation(parent: anim, curve: Curves.easeOut)),
        child: child,
      ),
    );
    if (selected != null) await _loadSession(selected);
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _autoScroll() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send({String? seedQuestion}) async {
    final text = (seedQuestion ?? _input.text).trim();
    final hasRef = (_anchorRef ?? '').isNotEmpty && _turns.isEmpty;
    if (text.isEmpty && !hasRef) return;
    if (_streaming) return;

    final repo = ref.read(sessionRepoProvider);
    _sessionId ??= await repo.createSession(anchorRef: _anchorRef);
    final sid = _sessionId!;

    _input.clear();
    final history = List<ChatTurn>.from(_turns);
    if (text.isNotEmpty) {
      _turns.add(ChatTurn(role: 'user', content: text));
      await repo.addMessage(sid, 'user', text);
      await repo.maybeTitleFromFirst(sid, text);
    }
    final reply = ChatTurn(role: 'assistant', content: '');
    setState(() {
      _turns.add(reply);
      _streaming = true;
    });
    _autoScroll();

    final stream = ref.read(assistantRepoProvider).chat(
          ref: _turns.length <= 2 ? _anchorRef : null,
          question: text.isEmpty ? null : text,
          mode: _mode,
          history: history,
        );

    await for (final evt in stream) {
      if (!mounted) return;
      switch (evt) {
        case MetaEvent(:final meta):
          setState(() {
            reply.meta = meta;
            _lastMeta = meta;
          });
        case DeltaEvent(:final text):
          setState(() => reply.content += text);
          _autoScroll();
        case DoneEvent():
          break;
        case ErrorEvent(:final message):
          setState(() => reply.content =
              reply.content.isEmpty ? message : '${reply.content}\n\n⚠️ $message');
      }
    }
    if (reply.content.isNotEmpty) {
      await repo.addMessage(sid, 'assistant', reply.content,
          citations: reply.meta?.citations ?? const []);
    }
    if (mounted) setState(() => _streaming = false);
    _autoScroll();
  }

  Future<void> _sendChip(String text, {AssistantMode? mode}) async {
    if (mode != null) setState(() => _mode = mode);
    await _send(seedQuestion: text);
  }

  bool get _quotaExhausted =>
      _lastMeta != null &&
      _lastMeta!.quotaLimit > 0 &&
      _lastMeta!.quotaUsed >= _lastMeta!.quotaLimit;

  bool get _quotaLow =>
      _lastMeta != null &&
      _lastMeta!.quotaLimit > 0 &&
      !_quotaExhausted &&
      _lastMeta!.quotaUsed >= _lastMeta!.quotaLimit - 2;

  @override
  Widget build(BuildContext context) {
    ref.listen(assistantSeedProvider, (prev, next) async {
      if (next == null) return;
      ref.read(assistantSeedProvider.notifier).consume();
      setState(() {
        _sessionId = null;
        _anchorRef = next.ref;
        _turns.clear();
        _lastMeta = null;
      });
      if (next.question != null && next.question!.isNotEmpty) {
        await _send(seedQuestion: next.question);
      } else if ((next.ref ?? '').isNotEmpty) {
        _sessionId = await ref.read(sessionRepoProvider).createSession(
            anchorRef: next.ref);
      }
    });

    final anchorLabel = _anchorRef ?? widget.seedRef ?? '未锚定经文';
    final intentChips = _turns.isEmpty
        ? const [
            ('经文背景', AssistantMode.explain, '请介绍这段经文的背景'),
            ('解释经文', AssistantMode.explain, '请解释这段经文'),
            ('应用', AssistantMode.apply, '请把这段经文应用到生活'),
            ('预备查经', AssistantMode.understand, '请帮我预备查经'),
            ('预备讲道', AssistantMode.understand, '请帮我预备讲道'),
            ('译本对照', AssistantMode.compare, '请对照不同译本解释这节'),
            ('原文释义', AssistantMode.original, '请从原文角度解释这节'),
          ]
        : const [
            ('经文背景', AssistantMode.explain, '请介绍这段经文的背景'),
            ('解释经文', AssistantMode.explain, '请解释这段经文'),
            ('应用', AssistantMode.apply, '请把这段经文应用到生活'),
            ('译本对照', AssistantMode.compare, '请对照不同译本解释这节'),
            ('原文释义', AssistantMode.original, '请从原文角度解释这节'),
            ('和「信」的关系？', AssistantMode.explain, '和「信」有什么关系？'),
            ('日常焦虑里？', AssistantMode.apply, '怎样用在日常焦虑里？'),
          ];

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 8, 0),
              child: Row(
                children: [
                  InkWell(
                    onTap: _openHistory,
                    borderRadius: BorderRadius.circular(8),
                    child: const Row(
                      children: [
                        Text('小爱',
                            style: TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 17,
                                color: AppColors.ink)),
                        SizedBox(width: 4),
                        Icon(Icons.history, size: 18, color: AppColors.inkFaint),
                      ],
                    ),
                  ),
                  const Spacer(),
                  if ((_anchorRef ?? widget.seedRef ?? '').isNotEmpty)
                    TextButton(
                      onPressed: () =>
                          ref.read(navIndexProvider.notifier).set(1),
                      child: Text(
                        anchorLabel,
                        style: const TextStyle(
                            color: AppColors.accentDeep, fontSize: 12),
                      ),
                    ),
                  IconButton(
                    tooltip: '新会话',
                    icon: const Icon(Icons.add_comment_outlined),
                    onPressed: _newSession,
                  ),
                ],
              ),
            ),
            if (_lastMeta != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    '今日 ${_lastMeta!.quotaUsed}/${_lastMeta!.quotaLimit}',
                    style: const TextStyle(
                        color: AppColors.inkFaint, fontSize: 11),
                  ),
                ),
              ),
            if (_quotaLow)
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 6, 16, 0),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text('今日 AI 次数即将用完',
                      style: TextStyle(color: Color(0xFFB8860B), fontSize: 12)),
                ),
              ),
            if (_quotaExhausted)
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 6, 16, 0),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    '今日 AI 次数已用完，明日恢复；仍可使用注释指南与阅读。',
                    style: TextStyle(color: AppColors.inkSoft, fontSize: 12),
                  ),
                ),
              ),
            if ((_anchorRef ?? '').isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
                child: _AnchorChip(refText: _anchorRef!),
              ),
            // 空态：提示 + 输入区（含可右滑 chips）整体垂直居中。
            if (_turns.isEmpty)
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _EmptyHint(
                      anchor: anchorLabel,
                      onChip: _quotaExhausted ? null : _sendChip,
                    ),
                    const SizedBox(height: 16),
                    _Composer(
                      controller: _input,
                      streaming: _streaming,
                      disabled: _quotaExhausted,
                      docked: false,
                      chips: intentChips,
                      onChip: _quotaExhausted ? null : _sendChip,
                      onSend: () => _send(),
                    ),
                  ],
                ),
              )
            else ...[
              Expanded(
                child: ListView.builder(
                  controller: _scroll,
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  itemCount: _turns.length,
                  itemBuilder: (_, i) => _Bubble(
                    turn: _turns[i],
                    streaming: _streaming,
                    onFollowup: _quotaExhausted
                        ? null
                        : (q) => _sendChip(q, mode: AssistantMode.explain),
                  ),
                ),
              ),
              _Composer(
                controller: _input,
                streaming: _streaming,
                disabled: _quotaExhausted,
                docked: true,
                chips: intentChips,
                onChip: _quotaExhausted ? null : _sendChip,
                onSend: () => _send(),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _EmptyHint extends StatelessWidget {
  const _EmptyHint({required this.anchor, this.onChip});
  final String anchor;
  final void Function(String text, {AssistantMode? mode})? onChip;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('带着经节锚点，继续深问',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.inkSoft, fontSize: 13)),
            const SizedBox(height: 8),
            Text('已预读 $anchor，点下面即秒回',
                textAlign: TextAlign.center,
                style: const TextStyle(
                    color: AppColors.accentDeep, fontSize: 13)),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: [
                _QuickPill(
                  label: '问今天这段经文的背景',
                  onTap: onChip == null
                      ? null
                      : () => onChip!(
                          '请介绍今天这段经文的背景',
                          mode: AssistantMode.explain),
                ),
                _QuickPill(
                  label: '永生是什么意思？',
                  onTap: onChip == null
                      ? null
                      : () => onChip!(
                          '这节里的「永生」是什么意思？',
                          mode: AssistantMode.explain),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickPill extends StatelessWidget {
  const _QuickPill({required this.label, this.onTap});
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      label: Text(label, style: const TextStyle(fontSize: 12)),
      backgroundColor: AppColors.accentWash,
      side: const BorderSide(color: AppColors.line),
      onPressed: onTap,
    );
  }
}

class _AnchorChip extends StatelessWidget {
  const _AnchorChip({required this.refText});
  final String refText;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.goldWash,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.menu_book_outlined, size: 14, color: AppColors.gold),
          const SizedBox(width: 6),
          Text('锚定经文 · $refText',
              style: const TextStyle(fontSize: 12, color: AppColors.gold)),
        ],
      ),
    );
  }
}

class _SessionListSheet extends ConsumerWidget {
  const _SessionListSheet({this.onNew});
  final VoidCallback? onNew;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessions = ref.watch(sessionsStreamProvider);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 12, 8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('历史会话',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const Spacer(),
              IconButton(
                tooltip: '新会话',
                icon: const Icon(Icons.add_comment_outlined,
                    color: AppColors.accentDeep),
                onPressed: () {
                  Navigator.pop(context);
                  onNew?.call();
                },
              ),
            ],
          ),
          const SizedBox(height: 4),
          Expanded(
            child: sessions.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Text('$e'),
                data: (list) {
                  if (list.isEmpty) {
                    return const Padding(
                      padding: EdgeInsets.all(20),
                      child: Text('还没有会话',
                          style: TextStyle(color: AppColors.inkFaint)),
                    );
                  }
                  return ListView.builder(
                    shrinkWrap: true,
                    itemCount: list.length,
                    itemBuilder: (_, i) {
                      final s = list[i];
                      return ListTile(
                        leading: const Icon(Icons.chat_bubble_outline,
                            color: AppColors.accentDeep),
                        title: Text(s.title,
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: s.anchorRef != null
                            ? Text('锚定 ${s.anchorRef}',
                                style: const TextStyle(fontSize: 12))
                            : null,
                        trailing: PopupMenuButton<String>(
                          onSelected: (v) async {
                            if (v == 'rename') {
                              await _rename(context, ref, s);
                            } else if (v == 'delete') {
                              await ref.read(sessionRepoProvider).delete(s);
                            }
                          },
                          itemBuilder: (_) => const [
                            PopupMenuItem(value: 'rename', child: Text('重命名')),
                            PopupMenuItem(value: 'delete', child: Text('删除')),
                          ],
                        ),
                        onTap: () => Navigator.pop(context, s),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      );
  }

  Future<void> _rename(
      BuildContext context, WidgetRef ref, AiSession s) async {
    final c = TextEditingController(text: s.title);
    final v = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('重命名会话'),
        content: TextField(controller: c, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, c.text),
              child: const Text('确定')),
        ],
      ),
    );
    if (v != null && v.trim().isNotEmpty) {
      await ref.read(sessionRepoProvider).rename(s, v.trim());
    }
  }
}


class _Bubble extends StatelessWidget {
  const _Bubble({required this.turn, this.streaming = false, this.onFollowup});
  final ChatTurn turn;
  final bool streaming;
  final void Function(String question)? onFollowup;

  @override
  Widget build(BuildContext context) {
    final isUser = turn.role == 'user';
    final followups = isUser ? const <String>[] : followupsOf(turn.content);
    final showActions = !isUser && turn.content.isNotEmpty && !streaming;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment:
            isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Container(
            constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.82),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            decoration: BoxDecoration(
              color: isUser ? AppColors.accentWash : AppColors.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.line),
            ),
            child: turn.content.isEmpty
                ? const Text('思考中…',
                    style: TextStyle(
                        height: 1.7, fontSize: 15, color: AppColors.inkFaint))
                : (isUser
                    ? Text(turn.content,
                        style: const TextStyle(
                            height: 1.7, fontSize: 15, color: AppColors.ink))
                    : AnswerText(text: turn.content)),
          ),
          if (!isUser && (turn.meta?.citations.isNotEmpty ?? false))
            _Citations(citations: turn.meta!.citations),
          if (showActions && followups.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: followups
                    .map((q) => ActionChip(
                          label: Text(q, style: const TextStyle(fontSize: 12)),
                          backgroundColor: AppColors.surface,
                          side: const BorderSide(color: AppColors.line),
                          onPressed:
                              onFollowup == null ? null : () => onFollowup!(q),
                        ))
                    .toList(),
              ),
            ),
          if (showActions)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(
                children: [
                  _ActionText(
                    label: '复制',
                    onTap: () => _copy(context, stripFollowups(turn.content)),
                  ),
                  const SizedBox(width: 16),
                  _ActionText(
                    label: '分享',
                    onTap: () => _copy(context, stripFollowups(turn.content),
                        share: true),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  void _copy(BuildContext context, String text, {bool share = false}) {
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(share ? '已复制，可粘贴分享到群或动态' : '已复制'),
      duration: const Duration(milliseconds: 1500),
    ));
  }
}

class _ActionText extends StatelessWidget {
  const _ActionText({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Text(label,
          style: const TextStyle(fontSize: 12, color: AppColors.inkFaint)),
    );
  }
}

class _Citations extends StatelessWidget {
  const _Citations({required this.citations});
  final List<Citation> citations;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6, left: 2),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: citations
            .map((c) => Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.goldWash,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text('[${c.n}] ${c.title}',
                      style: const TextStyle(
                          fontSize: 11, color: AppColors.gold)),
                ))
            .toList(),
      ),
    );
  }
}

class _Composer extends StatefulWidget {
  const _Composer({
    required this.controller,
    required this.streaming,
    required this.onSend,
    this.disabled = false,
    this.docked = true,
    this.chips = const [],
    this.onChip,
  });
  final TextEditingController controller;
  final bool streaming;
  final bool disabled;
  final bool docked;
  final VoidCallback onSend;
  final List<(String, AssistantMode, String)> chips;
  final void Function(String text, {AssistantMode? mode})? onChip;

  @override
  State<_Composer> createState() => _ComposerState();
}

class _ComposerState extends State<_Composer> {
  final SpeechToText _speech = SpeechToText();
  bool _voiceMode = false;
  bool _recording = false;
  bool _cancelArmed = false;
  String _transcript = '';
  double _startY = 0;

  @override
  void dispose() {
    _speech.cancel();
    super.dispose();
  }

  Future<void> _startVoice(LongPressStartDetails d) async {
    if (widget.disabled) return;
    final ok = await _speech.initialize(onError: (_) {}, onStatus: (_) {});
    if (!ok) {
      if (mounted) {
        setState(() => _voiceMode = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('无法使用语音输入，请检查麦克风权限')),
        );
      }
      return;
    }
    _startY = d.globalPosition.dy;
    _transcript = '';
    setState(() {
      _recording = true;
      _cancelArmed = false;
    });
    await _speech.listen(
      onResult: (r) => _transcript = r.recognizedWords,
      listenOptions: SpeechListenOptions(localeId: 'zh_CN'),
    );
  }

  void _moveVoice(LongPressMoveUpdateDetails d) {
    if (!_recording) return;
    final armed = _startY - d.globalPosition.dy > 60;
    if (armed != _cancelArmed) setState(() => _cancelArmed = armed);
  }

  Future<void> _endVoice(LongPressEndDetails d) async {
    if (!_recording) return;
    final willCancel = _cancelArmed;
    setState(() {
      _recording = false;
      _cancelArmed = false;
    });
    await _speech.stop();
    final text = _transcript.trim();
    _transcript = '';
    if (!willCancel && text.isNotEmpty) {
      widget.controller.text = text;
      widget.onSend();
    }
  }

  Widget _modeToggle() => IconButton(
        tooltip: _voiceMode ? '切换键盘' : '切换语音',
        iconSize: 20,
        icon: Icon(_voiceMode ? Icons.keyboard : Icons.mic_none,
            color: AppColors.inkSoft),
        onPressed: widget.disabled
            ? null
            : () => setState(() => _voiceMode = !_voiceMode),
      );

  @override
  Widget build(BuildContext context) {
    final chips = widget.chips;
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        decoration: BoxDecoration(
          color: widget.docked ? AppColors.paper : Colors.transparent,
          border: widget.docked
              ? const Border(top: BorderSide(color: AppColors.line))
              : null,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (chips.isNotEmpty)
              SizedBox(
                height: 34,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: chips.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 6),
                  itemBuilder: (_, i) {
                    final c = chips[i];
                    return ActionChip(
                      label: Text(c.$1, style: const TextStyle(fontSize: 12)),
                      backgroundColor: AppColors.surface,
                      side: const BorderSide(color: AppColors.line),
                      onPressed: widget.disabled || widget.onChip == null
                          ? null
                          : () => widget.onChip!(c.$3, mode: c.$2),
                    );
                  },
                ),
              ),
            if (chips.isNotEmpty) const SizedBox(height: 8),
            // 键盘/语音切换按钮放在输入框内部右侧；回车即发送，无独立发送按钮。
            _voiceMode
                ? GestureDetector(
                    onLongPressStart: _startVoice,
                    onLongPressMoveUpdate: _moveVoice,
                    onLongPressEnd: _endVoice,
                    child: Container(
                      height: 44,
                      alignment: Alignment.center,
                      padding: const EdgeInsets.only(right: 40),
                      decoration: BoxDecoration(
                        color: _recording
                            ? (_cancelArmed
                                ? const Color(0xFFFDECEC)
                                : AppColors.accentWash)
                            : AppColors.surface,
                        borderRadius: BorderRadius.circular(22),
                        border: Border.all(
                            color: _recording
                                ? (_cancelArmed
                                    ? const Color(0xFFD9534F)
                                    : AppColors.accentDeep)
                                : AppColors.line),
                      ),
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          Text(
                            _recording
                                ? (_cancelArmed ? '松开取消' : '松开发送 · 上滑取消')
                                : '按住 说话',
                            style: TextStyle(
                                fontSize: 14,
                                color: _recording
                                    ? (_cancelArmed
                                        ? const Color(0xFFD9534F)
                                        : AppColors.accentDeep)
                                    : AppColors.inkSoft),
                          ),
                          Positioned(right: -32, child: _modeToggle()),
                        ],
                      ),
                    ),
                  )
                : TextField(
                    controller: widget.controller,
                    enabled: !widget.disabled,
                    minLines: 1,
                    maxLines: 4,
                    textInputAction: TextInputAction.send,
                    onSubmitted:
                        widget.disabled ? null : (_) => widget.onSend(),
                    decoration: InputDecoration(
                      hintText: widget.disabled ? '今日次数已用完' : '问小爱…',
                      filled: true,
                      fillColor: AppColors.surface,
                      contentPadding:
                          const EdgeInsets.fromLTRB(14, 10, 4, 10),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(22),
                        borderSide: const BorderSide(color: AppColors.line),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(22),
                        borderSide: const BorderSide(color: AppColors.line),
                      ),
                      suffixIcon: _modeToggle(),
                      suffixIconConstraints:
                          const BoxConstraints(minWidth: 44, minHeight: 44),
                    ),
                  ),
          ],
        ),
      ),
    );
  }
}
