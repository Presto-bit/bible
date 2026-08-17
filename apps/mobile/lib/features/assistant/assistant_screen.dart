/// 小爱问答页：流式释经 + 多轮 + 脚注引用 + 游客限额提示。
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';
import 'package:speech_to_text/speech_to_text.dart';

import '../../app/app_shell.dart';
import '../../core/config.dart';
import '../../core/database/app_database.dart';
import '../../core/badge_stats.dart';
import '../../core/gamification.dart' show readingStreak;
import '../../core/ref_label.dart' show refToChineseLabel;
import '../../core/theme.dart';
import '../bible/reading_repository.dart';
import '../bible/thoughts_repository.dart';
import 'answer_text.dart';
import 'assistant_draft.dart';
import 'assistant_format.dart';
import 'assistant_personalize.dart';
import 'assistant_scenes.dart';
import 'assistant_seed.dart';
import 'assistant_repository.dart';
import 'assistant_thinking.dart';
import 'citation_evidence_rail.dart';
import 'history_session_swipe_row.dart';
import 'models.dart';
import 'session_repository.dart';

// 从回答末尾解析【相关追问】列表，供渲染可点击的追问 chip（服务端 followups 优先）。
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
  AssistantScene? _scene;
  bool _streaming = false;
  ChatMeta? _lastMeta;
  int _quotaUsed = 0;
  int _quotaLimit = 0;
  ThinkingPhase _streamPhase = ThinkingPhase.understanding;
  bool _streamSlow = false;
  Timer? _slowTimer;
  String? _anchorRef;
  String? _sessionId;
  String _knowledgeBaseId = 'platform';
  String _knowledgeBaseName = '平台知识库';
  List<KnowledgeBaseSummary> _kbs = const [];

  @override
  void initState() {
    super.initState();
    _anchorRef = widget.seedRef;
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  Future<void> _prefetchQuota() async {
    // 安卓原生壳不展示/不拦截游客日限（与服务端 X-Client-Kind 免配额对齐）。
    setState(() {
      _quotaUsed = 0;
      _quotaLimit = 0;
    });
  }

  Future<void> _loadComposerDraft() async {
    final draft = await loadComposerDraft();
    if (!mounted || draft.isEmpty) return;
    if (_input.text.isEmpty) {
      _input.text = draft;
      _input.selection = TextSelection.collapsed(offset: draft.length);
    }
  }

  Future<void> _loadKnowledgeBases() async {
    try {
      final list = await ref.read(assistantRepoProvider).listKnowledgeBases();
      if (!mounted || list.isEmpty) return;
      setState(() {
        _kbs = list;
        final match = list.where((k) => k.id == _knowledgeBaseId);
        final cur = match.isNotEmpty
            ? match.first
            : list.firstWhere((k) => k.isDefault, orElse: () => list.first);
        _knowledgeBaseId = cur.id;
        _knowledgeBaseName = cur.name;
      });
    } catch (_) {
      /* ignore */
    }
  }

  Future<void> _bootstrap() async {
    await Future.wait([
      _loadKnowledgeBases(),
      _prefetchQuota(),
      _loadComposerDraft(),
    ]);
    if (!mounted) return;
    final repo = ref.read(sessionRepoProvider);

    // 跨 Tab seed（半屏接力 / 深链）优先
    final seed = ref.read(assistantSeedProvider);
    if (seed != null) {
      ref.read(assistantSeedProvider.notifier).consume();
      await _applySeed(seed);
      return;
    }

    final hasSeed =
        (widget.seedRef ?? '').isNotEmpty ||
        (widget.seedQuestion ?? '').isNotEmpty;
    if (hasSeed) {
      await _applySeed(
        AssistantSeed(ref: widget.seedRef, question: widget.seedQuestion),
      );
      return;
    }
    // Tab 进入：续接最近一个会话（若有）。
    final sessions = await repo.watchSessions().first;
    if (sessions.isNotEmpty) {
      await _loadSession(sessions.first);
    }
  }

  Future<void> _applySeed(AssistantSeed seed) async {
    final repo = ref.read(sessionRepoProvider);
    if ((seed.knowledgeBaseId ?? '').isNotEmpty) {
      _knowledgeBaseId = seed.knowledgeBaseId!;
      final match = _kbs.where((k) => k.id == _knowledgeBaseId);
      if (match.isNotEmpty) {
        _knowledgeBaseName = match.first.name;
      }
    }
    setState(() {
      _anchorRef = seed.ref;
      _turns.clear();
      _lastMeta = null;
    });

    // 同日同锚点续用
    final resumed = await repo.findResumableSession(seed.ref);
    if (resumed != null) {
      await _loadSession(resumed);
      if (!mounted) return;
      // 已有当日会话：不再重复灌半屏种子 / 首问
      if (_turns.isNotEmpty) {
        _autoScroll();
        return;
      }
    } else {
      _sessionId = await repo.createSession(anchorRef: seed.ref);
    }
    if (!mounted) return;

    if (seed.seedMessages.isNotEmpty) {
      for (final m in seed.seedMessages) {
        final turn = ChatTurn(role: m.role, content: m.text);
        if (m.citations.isNotEmpty) {
          turn.meta = ChatMeta(
            mode: 'explain',
            modeLabel: '释经解释',
            display: 'half_sheet',
            citations: m.citations,
            quotaUsed: 0,
            quotaLimit: 0,
          );
        }
        _turns.add(turn);
        if (_sessionId != null) {
          await repo.addMessage(
            _sessionId!,
            m.role,
            m.text,
            citations: m.citations,
          );
        }
      }
      if (mounted) setState(() {});
      _autoScroll();
      return;
    }
    if ((seed.question ?? '').isNotEmpty) {
      await _send(seedQuestion: seed.question);
    }
  }

  Future<void> _loadSession(AiSession s) async {
    final repo = ref.read(sessionRepoProvider);
    List<ChatMessage> msgs;
    try {
      msgs = await repo
          .watchMessages(s.id)
          .first
          .timeout(const Duration(seconds: 3), onTimeout: () => const []);
    } catch (_) {
      msgs = const [];
    }
    if (!mounted) return;
    setState(() {
      _sessionId = s.id;
      _anchorRef = s.anchorRef;
      _turns
        ..clear()
        ..addAll(
          msgs.map((m) {
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
          }),
        );
    });
    _autoScroll();
  }

  void _newSession() {
    setState(() {
      _sessionId = null;
      _anchorRef = null;
      _turns.clear();
      _lastMeta = null;
      _knowledgeBaseId = 'platform';
      _knowledgeBaseName = '平台知识库';
    });
  }

  Future<void> _pickKnowledgeBase() async {
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  '知识库',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                ),
              ),
            ),
            ListTile(
              title: const Text('平台知识库'),
              subtitle: const Text('含中文研经、公版英文注释、原文与词典（默认）'),
              trailing: const Icon(Icons.check, color: AppColors.accentDeep),
              onTap: () => Navigator.pop(ctx),
            ),
            ListTile(
              title: const Text('浏览知识库'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                Navigator.pop(ctx);
                context.push('/knowledge-bases');
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openHistory() async {
    // 对齐 PWA：约 82% 屏宽左抽屉
    final selected = await showGeneralDialog<AiSession>(
      context: context,
      barrierDismissible: true,
      barrierLabel: '历史会话',
      barrierColor: Colors.black.withValues(alpha: 0.4),
      transitionDuration: const Duration(milliseconds: 220),
      pageBuilder: (_, __, ___) {
        final w = MediaQuery.of(context).size.width;
        final drawerW = (w * 0.82).clamp(260.0, 340.0);
        return Align(
          alignment: Alignment.centerLeft,
          child: SizedBox(
            width: drawerW,
            height: double.infinity,
            child: Material(
              color: AppColors.surface,
              elevation: 8,
              child: SafeArea(
                child: _SessionListSheet(
                  onNew: _newSession,
                  activeId: _sessionId,
                ),
              ),
            ),
          ),
        );
      },
      transitionBuilder: (_, anim, __, child) => SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(-1, 0),
          end: Offset.zero,
        ).animate(CurvedAnimation(parent: anim, curve: Curves.easeOut)),
        child: child,
      ),
    );
    if (selected != null) await _loadSession(selected);
  }

  @override
  void dispose() {
    _slowTimer?.cancel();
    // 不在异步间隙写已 dispose 的 controller；先取文字再 dispose。
    final draft = _input.text;
    unawaited(saveComposerDraft(draft));
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

  Future<void> _send({String? seedQuestion, AssistantScene? scene}) async {
    final text = (seedQuestion ?? _input.text).trim();
    final hasRef = (_anchorRef ?? '').isNotEmpty && _turns.isEmpty;
    if (text.isEmpty && !hasRef) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('请输入问题'),
            duration: Duration(milliseconds: 1200),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
      return;
    }
    if (_streaming) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('小爱还在回答，稍后再问'),
            duration: Duration(milliseconds: 1200),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
      return;
    }

    // 用户显式要「争议/并列」且未指定 scene 时，走并列观点模板。
    var activeScene = scene ?? resolveScene(mode: _mode.id);
    if (scene == null && text.isNotEmpty && detectsViewpointsIntent(text)) {
      activeScene = AssistantScene.chatViewpoints;
    }
    _scene = activeScene;
    final modeFromScene = AssistantMode.fromId(activeScene.mode) ?? _mode;
    setState(() => _mode = modeFromScene);

    final repo = ref.read(sessionRepoProvider);
    _sessionId ??= await repo.createSession(anchorRef: _anchorRef);
    final sid = _sessionId!;

    _input.clear();
    unawaited(clearComposerDraft());
    final history = _turns
        .where((t) => t.content.trim().isNotEmpty)
        .map(
          (t) => ChatTurn(
            role: t.role,
            content: t.role == 'assistant' ? bodyText(t.content) : t.content,
          ),
        )
        .toList();
    if (text.isNotEmpty) {
      _turns.add(ChatTurn(role: 'user', content: text));
      await repo.addMessage(sid, 'user', text);
      await repo.maybeTitleFromFirst(sid, text);
      ref
          .read(badgeStatsRecorderProvider)
          .recordXiaoAiQuestion(scene: activeScene.id, ref: _anchorRef);
      final userTurns = _turns.where((t) => t.role == 'user').length;
      if (userTurns > 1) {
        ref
            .read(badgeStatsRecorderProvider)
            .recordXiaoAiFollowup(userTurns - 1);
      }
    }
    final reply = ChatTurn(
      role: 'assistant',
      content: '',
      scene: activeScene.id,
    );
    _slowTimer?.cancel();
    setState(() {
      _turns.add(reply);
      _streaming = true;
      _streamPhase = ThinkingPhase.understanding;
      _streamSlow = false;
    });
    _slowTimer = Timer(const Duration(seconds: 15), () {
      if (mounted && _streaming && reply.content.isEmpty) {
        setState(() => _streamSlow = true);
      }
    });
    _autoScroll();

    var gotDelta = false;
    var pendingDelta = '';
    Timer? deltaFlush;
    void flushDelta({bool force = false}) {
      if (pendingDelta.isEmpty && !force) return;
      final chunk = pendingDelta;
      pendingDelta = '';
      if (!mounted) return;
      setState(() {
        if (!gotDelta && chunk.isNotEmpty) {
          gotDelta = true;
          _streamPhase = ThinkingPhase.writing;
        }
        if (chunk.isNotEmpty) reply.content += chunk;
      });
      _autoScroll();
    }

    Stream<ChatEvent> openStream() => ref
        .read(assistantRepoProvider)
        .chat(
          ref: _turns.length <= 2 ? _anchorRef : null,
          question: text.isEmpty ? null : text,
          mode: modeFromScene,
          scene: activeScene,
          history: history,
          knowledgeBaseId: _knowledgeBaseId,
        );

    var receivedDelta = false;
    var terminalError = false;
    try {
      // 首段正文前的断网/代理断流常见且可重试；最多一次，避免重复回答。
      for (var attempt = 0; attempt < 2; attempt++) {
        try {
          await for (final evt in openStream()) {
            if (!mounted) return;
            switch (evt) {
              case MetaEvent(:final meta):
                setState(() {
                  reply.meta = meta;
                  reply.sceneLabel = meta.sceneLabel;
                  _lastMeta = meta;
                  if (meta.quotaLimit > 0) {
                    // 忽略游客限流 meta：安卓原生不套用 10 次
                    _quotaUsed = 0;
                    _quotaLimit = 0;
                  }
                  _streamPhase = ThinkingPhase.refs;
                });
              case DeltaEvent(:final text):
                receivedDelta = true;
                pendingDelta += text;
                deltaFlush ??= Timer.periodic(
                  const Duration(milliseconds: 100),
                  (_) {
                    flushDelta();
                    if (pendingDelta.isEmpty) {
                      deltaFlush?.cancel();
                      deltaFlush = null;
                    }
                  },
                );
              case FollowupsEvent(:final items):
                flushDelta(force: true);
                setState(() => reply.followups = items);
              case DoneEvent(:final followups):
                flushDelta(force: true);
                if (followups.isNotEmpty) {
                  setState(() => reply.followups = followups);
                }
              case ErrorEvent(:final message):
                terminalError = true;
                flushDelta(force: true);
                setState(
                  () => reply.content = reply.content.isEmpty
                      ? message
                      : '${reply.content}\n\n⚠️ $message',
                );
            }
          }
        } catch (_) {
          // 连接在 headers 已返回后中断会在此抛出；由 finally 统一恢复 UI。
        }

        deltaFlush?.cancel();
        deltaFlush = null;
        flushDelta(force: true);
        if (receivedDelta || terminalError) break;
        if (attempt == 0 && mounted) {
          setState(() {
            _streamPhase = ThinkingPhase.understanding;
            _streamSlow = false;
          });
        }
      }

      if (reply.content.isEmpty && mounted) {
        setState(() {
          reply.content = '连接中断，已自动重试一次仍未收到回答，请稍后再试。';
        });
      }
      if (reply.content.isNotEmpty) {
        await repo.addMessage(
          sid,
          'assistant',
          bodyText(reply.content),
          citations: reply.meta?.citations ?? const [],
        );
      }
    } finally {
      deltaFlush?.cancel();
      flushDelta(force: true);
      _slowTimer?.cancel();
      if (mounted) {
        setState(() {
          _streaming = false;
          _streamSlow = false;
          _streamPhase = ThinkingPhase.understanding;
        });
      }
      _autoScroll();
    }
  }

  Future<void> _sendChip(
    String text, {
    AssistantMode? mode,
    AssistantScene? scene,
  }) async {
    if (mode != null) setState(() => _mode = mode);
    await _send(seedQuestion: text, scene: scene);
  }

  bool get _quotaExhausted => _quotaLimit > 0 && _quotaUsed >= _quotaLimit;

  bool get _quotaLow =>
      _quotaLimit > 0 && !_quotaExhausted && _quotaUsed >= _quotaLimit - 2;

  @override
  Widget build(BuildContext context) {
    ref.listen(assistantSeedProvider, (prev, next) async {
      if (next == null) return;
      ref.read(assistantSeedProvider.notifier).consume();
      await _applySeed(next);
    });

    final anchorLabel = _anchorRef ?? widget.seedRef ?? '未锚定经文';
    final review = ref.watch(reviewDataProvider).asData?.value;
    final streak = review != null ? readingStreak(review) : 0;
    final hasLastRead =
        ref.watch(readingProgressStreamProvider).asData?.value != null;
    final List<(String, AssistantMode, String, AssistantScene?)> intentChips;
    if (_turns.isEmpty) {
      final personalized = personalizedAssistantChips(
        ref: (_anchorRef ?? widget.seedRef)?.isNotEmpty == true
            ? (_anchorRef ?? widget.seedRef)
            : null,
        streak: streak,
        hasLastRead: hasLastRead,
      );
      intentChips = personalized
          .map((c) => (c.label, c.assistantMode, c.q, c.scene))
          .toList();
    } else {
      intentChips = [
        (
          '经文背景',
          AssistantMode.explain,
          chipUserQuestion('经文背景', ref: anchorLabel),
          AssistantScene.chatExplain,
        ),
        (
          '解释经文',
          AssistantMode.explain,
          chipUserQuestion('解释经文', ref: anchorLabel),
          AssistantScene.chatExplain,
        ),
        (
          '应用',
          AssistantMode.apply,
          chipUserQuestion('生活应用', ref: anchorLabel),
          AssistantScene.chatApply,
        ),
        (
          '译本对照',
          AssistantMode.compare,
          chipUserQuestion('译本对照', ref: anchorLabel),
          AssistantScene.chatCompare,
        ),
        (
          '和「信」的关系？',
          AssistantMode.explain,
          '和「信」有什么关系？',
          AssistantScene.chatExplain,
        ),
        ('日常焦虑里？', AssistantMode.apply, '怎样用在日常焦虑里？', AssistantScene.chatApply),
      ];
    }

    final showQuota = _quotaLimit > 0;

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
                        Text(
                          '小爱',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 17,
                            color: AppColors.ink,
                          ),
                        ),
                        SizedBox(width: 4),
                        Icon(
                          Icons.history,
                          size: 18,
                          color: AppColors.inkFaint,
                        ),
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
                          color: AppColors.accentDeep,
                          fontSize: 12,
                        ),
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
            if (showQuota)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    '今日 $_quotaUsed/$_quotaLimit',
                    style: const TextStyle(
                      color: AppColors.inkFaint,
                      fontSize: 11,
                    ),
                  ),
                ),
              ),
            if (_quotaLow)
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 6, 16, 0),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    '今日 AI 次数即将用完',
                    style: TextStyle(color: Color(0xFFB8860B), fontSize: 12),
                  ),
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
            // 空态：提示贴顶，下方紧接输入区，避免一条一行占满屏。
            if (_turns.isEmpty)
              Expanded(
                // 空态将引导、四个问题和输入框作为一个整体垂直居中，
                // 与 PWA `.assistant-body.is-empty` 一致，避免输入框沉到底部。
                child: Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(vertical: 20),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _EmptyHint(
                          anchor: anchorLabel,
                          onChip: _quotaExhausted ? null : _sendChip,
                        ),
                        const SizedBox(height: 18),
                        _Composer(
                          controller: _input,
                          streaming: _streaming,
                          disabled: _quotaExhausted,
                          docked: false,
                          // 空态已有 demo pill，composer 内不重复 chips（对齐 PWA）
                          chips: const [],
                          onChip: null,
                          onSend: () => _send(),
                          knowledgeBaseLabel: _knowledgeBaseName,
                          onPickKnowledgeBase: _quotaExhausted
                              ? null
                              : _pickKnowledgeBase,
                        ),
                      ],
                    ),
                  ),
                ),
              )
            else ...[
              Expanded(
                child: ListView.builder(
                  controller: _scroll,
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  itemCount: _turns.length,
                  itemBuilder: (_, i) {
                    final isLast = i == _turns.length - 1;
                    final turn = _turns[i];
                    final thinking =
                        _streaming &&
                        isLast &&
                        turn.role == 'assistant' &&
                        turn.content.isEmpty;
                    return _Bubble(
                      turn: turn,
                      streaming: _streaming && isLast,
                      thinkingPhase: thinking ? _streamPhase : null,
                      streamSlow: thinking && _streamSlow,
                      anchorRef: _anchorRef,
                      onFollowup: _quotaExhausted
                          ? null
                          : (q) =>
                                _sendChip(q, scene: AssistantScene.chatExplain),
                      onSwitchToPlatform: () => setState(() {
                        _knowledgeBaseId = 'platform';
                        _knowledgeBaseName = '平台知识库';
                      }),
                    );
                  },
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
                knowledgeBaseLabel: _knowledgeBaseName,
                onPickKnowledgeBase: _quotaExhausted
                    ? null
                    : _pickKnowledgeBase,
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
  final void Function(
    String text, {
    AssistantMode? mode,
    AssistantScene? scene,
  })?
  onChip;

  static const _demos = <(String label, String q, AssistantMode mode)>[
    (
      '约翰福音 3:16，传统注释怎么讲？',
      '约翰福音 3:16 在传统释经资料里通常怎么解释？请尽量引用注释要点。',
      AssistantMode.explain,
    ),
    (
      '「爱」在原文是什么意思？',
      '新约里「爱」常用的原文词（如 agape、phileo）有什么区别？请结合释经资料说明。',
      AssistantMode.original,
    ),
    (
      '这段经文的历史背景？',
      '请介绍一段常见经文（如约翰福音 3 章）的历史与写作背景，并参考释经资料。',
      AssistantMode.explain,
    ),
    (
      '怎样用在今天的生活？',
      '若今天读到「不要忧虑」（马太福音 6:25–34），释经与应用上可以怎么落到日常生活？',
      AssistantMode.apply,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final hasAnchor = anchor.isNotEmpty && anchor != '未锚定经文';
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 300),
              child: Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.fromLTRB(18, 20, 18, 18),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      AppColors.accent.withValues(alpha: 0.10),
                      AppColors.surface,
                    ],
                  ),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x120F172A),
                      blurRadius: 20,
                      offset: Offset(0, 8),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    const Text(
                      '小爱',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.inkSoft,
                        letterSpacing: 0.7,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      '一起把经文聊明白',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: AppColors.ink,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Center(
            child: Text(
              hasAnchor ? '已锚定 $anchor · 结合释经资料回答' : '可结合释经资料回答；点下面试试，需要联网',
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: AppColors.inkSoft,
                fontSize: 13,
                height: 1.65,
              ),
            ),
          ),
          const SizedBox(height: 14),
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 340),
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.center,
                children: _demos
                    .map(
                      (d) => _QuickPill(
                        label: d.$1,
                        onTap: onChip == null
                            ? null
                            : () => onChip!(d.$2, mode: d.$3),
                      ),
                    )
                    .toList(),
              ),
            ),
          ),
        ],
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
    return Material(
      color: AppColors.accentWash,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          constraints: const BoxConstraints(maxWidth: 280),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: AppColors.line),
          ),
          child: Text(
            label,
            maxLines: 2,
            softWrap: true,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 12.5,
              height: 1.25,
              color: AppColors.ink,
            ),
          ),
        ),
      ),
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
          Text(
            '锚定经文 · $refText',
            style: const TextStyle(fontSize: 12, color: AppColors.gold),
          ),
        ],
      ),
    );
  }
}

class _SessionListSheet extends ConsumerStatefulWidget {
  const _SessionListSheet({this.onNew, this.activeId});
  final VoidCallback? onNew;
  final String? activeId;

  @override
  ConsumerState<_SessionListSheet> createState() => _SessionListSheetState();
}

class _SessionListSheetState extends ConsumerState<_SessionListSheet> {
  List<AiSession>? _snapshot;
  final Map<String, String> _previews = {};
  final Set<String> _collapsed = {};
  final _swipeController = HistorySessionSwipeController();
  Object? _err;

  @override
  void initState() {
    super.initState();
    _loadOnce();
  }

  @override
  void dispose() {
    _swipeController.dispose();
    super.dispose();
  }

  Future<void> _loadOnce() async {
    try {
      final list = await ref
          .read(sessionRepoProvider)
          .watchSessions()
          .first
          .timeout(
            const Duration(seconds: 4),
            onTimeout: () => const <AiSession>[],
          );
      final previews = <String, String>{};
      for (final s in list) {
        final p = await ref.read(sessionRepoProvider).previewOf(s.id);
        if (p != null && p.isNotEmpty) previews[s.id] = p;
      }
      if (mounted) {
        setState(() {
          _snapshot = list;
          _previews
            ..clear()
            ..addAll(previews);
          _err = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _snapshot = const [];
          _err = e;
        });
      }
    }
  }

  Future<void> _rename(AiSession s) async {
    final c = TextEditingController(text: s.title);
    final v = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('重命名会话'),
        content: TextField(controller: c, autofocus: true),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, c.text),
            child: const Text('确定'),
          ),
        ],
      ),
    );
    if (v != null && v.trim().isNotEmpty) {
      await ref.read(sessionRepoProvider).rename(s, v.trim());
      await _loadOnce();
    }
  }

  Future<void> _delete(AiSession s) async {
    await ref.read(sessionRepoProvider).delete(s);
    await _loadOnce();
  }

  /// 按 anchorRef 分组；空锚点归「随问」，且「随问」置末。
  List<MapEntry<String, List<AiSession>>> _grouped(List<AiSession> list) {
    final map = <String, List<AiSession>>{};
    for (final s in list) {
      final key = (s.anchorRef == null || s.anchorRef!.trim().isEmpty)
          ? '随问'
          : s.anchorRef!.trim();
      map.putIfAbsent(key, () => []).add(s);
    }
    final entries = map.entries.toList()
      ..sort((a, b) {
        if (a.key == '随问') return 1;
        if (b.key == '随问') return -1;
        return a.key.compareTo(b.key);
      });
    return entries;
  }

  String _timeLabel(int ms) {
    final now = DateTime.now();
    final today0 = DateTime(now.year, now.month, now.day);
    final day0 = DateTime.fromMillisecondsSinceEpoch(ms);
    final d0 = DateTime(day0.year, day0.month, day0.day);
    final diff = today0.difference(d0).inDays;
    if (diff <= 0) return '今天';
    if (diff == 1) return '昨天';
    if (diff < 7) return '本周';
    return '${day0.year}-${day0.month.toString().padLeft(2, '0')}-${day0.day.toString().padLeft(2, '0')}';
  }

  Widget _sessionCard(AiSession s) {
    final active = widget.activeId == s.id;
    final cnRef = refToChineseLabel(s.anchorRef);
    final preview = _previews[s.id];
    final card = Material(
      color: active
          ? AppColors.accent.withValues(alpha: 0.08)
          : AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: active
              ? AppColors.accent.withValues(alpha: 0.55)
              : AppColors.line,
          width: active ? 1.5 : 1,
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => Navigator.pop(context, s),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      s.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                        color: AppColors.ink,
                      ),
                    ),
                  ),
                  Text(
                    _timeLabel(s.updatedAtMs),
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.inkFaint,
                    ),
                  ),
                ],
              ),
              if (cnRef != null && cnRef.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    cnRef,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.accentDeep,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              if (preview != null && preview.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    preview,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      height: 1.4,
                      color: AppColors.inkFaint,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: HistorySessionSwipeRow(
        id: s.id,
        controller: _swipeController,
        onRename: () => _rename(s),
        onDelete: () => _delete(s),
        child: card,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final live = ref.watch(sessionsStreamProvider).asData?.value;
    final list = (live != null && live.isNotEmpty) ? live : _snapshot;
    final groups = list == null ? null : _grouped(list);
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 14, 12, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                '历史会话',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
              ),
              const Spacer(),
              TextButton(
                onPressed: () {
                  Navigator.pop(context);
                  widget.onNew?.call();
                },
                child: const Text(
                  '+ 新会话',
                  style: TextStyle(fontSize: 13, color: AppColors.accentDeep),
                ),
              ),
              IconButton(
                tooltip: '关闭',
                icon: const Icon(Icons.close, size: 22),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Expanded(
            child: Listener(
              // 改名/删除只随左滑露出；点抽屉任意空白或另一行即收起。
              onPointerDown: (_) => _swipeController.close(),
              child: groups == null
                  ? const Center(child: CircularProgressIndicator())
                  : groups.isEmpty
                  ? Center(
                      child: Text(
                        _err != null ? '暂时无法加载会话' : '暂无历史会话，开始提问后会自动保存。',
                        style: const TextStyle(color: AppColors.inkFaint),
                        textAlign: TextAlign.center,
                      ),
                    )
                  : ListView.builder(
                      itemCount: groups.length,
                      itemBuilder: (_, i) {
                        final g = groups[i];
                        // 首组默认展开；其他默认折叠
                        final isCollapsed = i == 0
                            ? _collapsed.contains(g.key)
                            : !_collapsed.contains('open:${g.key}');
                        final headLabel = g.key == '随问'
                            ? '随问'
                            : (refToChineseLabel(g.key) ?? g.key);
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            InkWell(
                              onTap: () => setState(() {
                                if (i == 0) {
                                  if (_collapsed.contains(g.key)) {
                                    _collapsed.remove(g.key);
                                  } else {
                                    _collapsed.add(g.key);
                                  }
                                } else {
                                  final k = 'open:${g.key}';
                                  if (_collapsed.contains(k)) {
                                    _collapsed.remove(k);
                                  } else {
                                    _collapsed.add(k);
                                  }
                                }
                              }),
                              child: Padding(
                                padding: const EdgeInsets.fromLTRB(2, 10, 2, 6),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        headLabel,
                                        style: const TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                    Text(
                                      '${g.value.length} 条 · ${isCollapsed ? '展开' : '收起'}',
                                      style: const TextStyle(
                                        fontSize: 11,
                                        color: AppColors.inkFaint,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            if (!isCollapsed)
                              for (final s in g.value) _sessionCard(s),
                          ],
                        );
                      },
                    ),
            ),
          ),
          const Padding(
            padding: EdgeInsets.fromLTRB(4, 10, 4, 4),
            child: Center(
              child: Text(
                '为你保留最近30天历史',
                style: TextStyle(fontSize: 11, color: AppColors.inkFaint),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Bubble extends ConsumerWidget {
  const _Bubble({
    required this.turn,
    this.streaming = false,
    this.thinkingPhase,
    this.streamSlow = false,
    this.anchorRef,
    this.onFollowup,
    this.onSwitchToPlatform,
  });
  final ChatTurn turn;
  final bool streaming;
  final ThinkingPhase? thinkingPhase;
  final bool streamSlow;
  final String? anchorRef;
  final void Function(String question)? onFollowup;
  final VoidCallback? onSwitchToPlatform;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isUser = turn.role == 'user';
    final followups = isUser
        ? const <String>[]
        : (turn.followups.isNotEmpty
              ? turn.followups
              : followupsOf(turn.content));
    final displayText = isUser ? turn.content : bodyText(turn.content);
    final showActions = !isUser && turn.content.isNotEmpty && !streaming;
    final cites = turn.meta?.citations ?? const <Citation>[];
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: isUser
            ? CrossAxisAlignment.end
            : CrossAxisAlignment.start,
        children: [
          if (isUser)
            Container(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.82,
              ),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
              decoration: BoxDecoration(
                color: AppColors.accentWash,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.line),
              ),
              child: Text(
                displayText,
                style: const TextStyle(
                  height: 1.7,
                  fontSize: 15,
                  color: AppColors.ink,
                ),
              ),
            )
          else
            // 助手答文：无外框全宽，对齐 PWA .assistant-answer
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: turn.content.isEmpty
                  ? AssistantThinkingState(
                      phase: thinkingPhase ?? ThinkingPhase.understanding,
                      citeCount: cites.length,
                      slow: streamSlow,
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (!displayText.startsWith('⚠️'))
                          _RagSourceStatus(
                            count: cites.length,
                            useRag:
                                turn.meta?.useRag ??
                                !(turn.scene?.startsWith('summary_') ?? false),
                            knowledgeBaseId: turn.meta?.knowledgeBaseId,
                            knowledgeBaseName: turn.meta?.knowledgeBaseName,
                            onSwitchToPlatform: onSwitchToPlatform,
                          ),
                        AnswerText(
                          text: displayText,
                          onCitationTap: cites.isEmpty
                              ? null
                              : (n) {
                                  final match = cites
                                      .where((c) => c.n == n)
                                      .toList();
                                  if (match.isEmpty) return;
                                  showModalBottomSheet<void>(
                                    context: context,
                                    isScrollControlled: true,
                                    backgroundColor: Colors.transparent,
                                    builder: (_) => _CitationBilingualSheet(
                                      citation: match.first,
                                    ),
                                  );
                                },
                        ),
                      ],
                    ),
            ),
          if (!isUser && cites.isNotEmpty)
            CitationEvidenceRail(
              citations: cites,
              onOpen: (n) {
                final match = cites.where((c) => c.n == n);
                if (match.isEmpty) return;
                ref.read(badgeStatsRecorderProvider).recordCitationClick();
                showModalBottomSheet<void>(
                  context: context,
                  isScrollControlled: true,
                  showDragHandle: true,
                  builder: (ctx) =>
                      _CitationBilingualSheet(citation: match.first),
                );
              },
            ),
          if (showActions && followups.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: followups
                    .map(
                      (q) => ActionChip(
                        label: Text(q, style: const TextStyle(fontSize: 12)),
                        backgroundColor: AppColors.surface,
                        side: const BorderSide(color: AppColors.line),
                        onPressed: onFollowup == null
                            ? null
                            : () => onFollowup!(q),
                      ),
                    )
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
                    label: '存想法',
                    onTap: () => _saveThought(context, ref),
                  ),
                  const SizedBox(width: 16),
                  _ActionText(
                    label: '分享',
                    onTap: () =>
                        _share(context, ref, stripFollowups(turn.content)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _saveThought(BuildContext context, WidgetRef ref) async {
    final body = stripFollowups(turn.content).trim();
    if (body.isEmpty) return;
    final thoughtRef = (anchorRef ?? '').isEmpty ? 'FREE' : anchorRef!;
    await ref
        .read(thoughtsRepoProvider)
        .addThought(thoughtRef, body, shared: false);
    ref.read(badgeStatsRecorderProvider).recordSaveAnswerNote();
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('已存想法'),
        duration: Duration(milliseconds: 1500),
      ),
    );
  }

  void _copy(BuildContext context, String text) {
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('已复制'),
        duration: Duration(milliseconds: 1500),
      ),
    );
  }

  Future<void> _share(BuildContext context, WidgetRef ref, String text) async {
    Clipboard.setData(ClipboardData(text: text));
    var payload = text;
    try {
      final id = await ref
          .read(assistantRepoProvider)
          .createAnalysisShareSnapshot(
            answerMarkdown: text,
            refLabel: anchorRef,
            refParam: anchorRef,
          );
      if (id != null && id.isNotEmpty) {
        final base = AppConfig.webBaseUrl.replaceAll(RegExp(r'/+$'), '');
        payload = '$text\n$base/share/analysis/$id';
      }
    } catch (_) {
      // 快照失败则纯文案分享
    }
    try {
      await SharePlus.instance.share(ShareParams(text: payload));
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('已复制，可粘贴分享到群或动态'),
          duration: Duration(milliseconds: 1500),
        ),
      );
    }
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
      child: Text(
        label,
        style: const TextStyle(fontSize: 12, color: AppColors.inkFaint),
      ),
    );
  }
}

class _RagSourceStatus extends StatelessWidget {
  const _RagSourceStatus({
    required this.count,
    required this.useRag,
    this.knowledgeBaseId,
    this.knowledgeBaseName,
    this.onSwitchToPlatform,
  });
  final int count;
  final bool useRag;
  final String? knowledgeBaseId;
  final String? knowledgeBaseName;
  final VoidCallback? onSwitchToPlatform;

  @override
  Widget build(BuildContext context) {
    if (!useRag) return const SizedBox.shrink();
    final isTopic = knowledgeBaseId != null && knowledgeBaseId != 'platform';
    final kbSuffix = isTopic && (knowledgeBaseName?.isNotEmpty ?? false)
        ? ' · $knowledgeBaseName'
        : '';
    final text = count > 0
        ? '已参考 $count 条释经资料$kbSuffix'
        : '本次以圣经与通识作答 · 资料库暂无直接对应注释$kbSuffix';
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text(
            text,
            style: const TextStyle(
              fontSize: 12,
              height: 1.4,
              color: AppColors.inkFaint,
            ),
          ),
          if (count == 0 && isTopic && onSwitchToPlatform != null)
            TextButton(
              onPressed: onSwitchToPlatform,
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: const Text('换回平台库', style: TextStyle(fontSize: 12)),
            ),
        ],
      ),
    );
  }
}

class _CitationBilingualSheet extends ConsumerStatefulWidget {
  const _CitationBilingualSheet({required this.citation});
  final Citation citation;

  @override
  ConsumerState<_CitationBilingualSheet> createState() =>
      _CitationBilingualSheetState();
}

class _CitationBilingualSheetState
    extends ConsumerState<_CitationBilingualSheet> {
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
      final res = await ref
          .read(assistantRepoProvider)
          .explainCitation(snippet: snip, title: widget.citation.title);
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
                  height: 1.45,
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

class _Composer extends StatefulWidget {
  const _Composer({
    required this.controller,
    required this.streaming,
    required this.onSend,
    this.disabled = false,
    this.docked = true,
    this.chips = const [],
    this.onChip,
    this.knowledgeBaseLabel,
    this.onPickKnowledgeBase,
  });
  final TextEditingController controller;
  final bool streaming;
  final bool disabled;
  final bool docked;
  final VoidCallback onSend;
  final List<(String, AssistantMode, String, AssistantScene?)> chips;
  final void Function(
    String text, {
    AssistantMode? mode,
    AssistantScene? scene,
  })?
  onChip;
  final String? knowledgeBaseLabel;
  final VoidCallback? onPickKnowledgeBase;

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
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('当前设备无法使用语音，请改用键盘输入')));
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
    icon: Icon(
      _voiceMode ? Icons.keyboard : Icons.mic_none,
      color: AppColors.inkSoft,
    ),
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
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                clipBehavior: Clip.none,
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    for (var i = 0; i < chips.length; i++) ...[
                      if (i > 0) const SizedBox(width: 6),
                      Builder(
                        builder: (_) {
                          final c = chips[i];
                          return Material(
                            color: AppColors.surface,
                            borderRadius: BorderRadius.circular(999),
                            child: InkWell(
                              borderRadius: BorderRadius.circular(999),
                              onTap: widget.disabled || widget.onChip == null
                                  ? null
                                  : () => widget.onChip!(
                                      c.$3,
                                      mode: c.$2,
                                      scene: c.$4 ?? chipSceneForLabel(c.$1),
                                    ),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 7,
                                ),
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(999),
                                  border: Border.all(color: AppColors.line),
                                ),
                                child: Text(
                                  c.$1,
                                  style: TextStyle(
                                    fontSize: 12,
                                    height: 1.3,
                                    color: widget.disabled
                                        ? AppColors.inkFaint
                                        : AppColors.ink,
                                  ),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ],
                  ],
                ),
              ),
            if (chips.isNotEmpty) const SizedBox(height: 8),
            // 输入框 + 发送按钮（部分 Android 键盘不触发 IME send）
            _voiceMode
                ? GestureDetector(
                    onLongPressStart: _startVoice,
                    onLongPressMoveUpdate: _moveVoice,
                    onLongPressEnd: _endVoice,
                    child: Container(
                      height: 44,
                      alignment: Alignment.center,
                      padding: const EdgeInsets.only(left: 40, right: 40),
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
                              : AppColors.line,
                        ),
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
                                  : AppColors.inkSoft,
                            ),
                          ),
                          if (widget.onPickKnowledgeBase != null)
                            Positioned(
                              left: -32,
                              child: IconButton(
                                tooltip: '平台知识库',
                                iconSize: 20,
                                icon: const Icon(
                                  Icons.layers_outlined,
                                  color: AppColors.inkSoft,
                                ),
                                onPressed: widget.disabled
                                    ? null
                                    : widget.onPickKnowledgeBase,
                              ),
                            ),
                          Positioned(right: -32, child: _modeToggle()),
                        ],
                      ),
                    ),
                  )
                : Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: TextField(
                          controller: widget.controller,
                          enabled: !widget.disabled,
                          minLines: 1,
                          maxLines: 4,
                          textInputAction: TextInputAction.send,
                          onSubmitted: widget.disabled || widget.streaming
                              ? null
                              : (_) => widget.onSend(),
                          decoration: InputDecoration(
                            hintText: widget.disabled ? '今日次数已用完' : '问小爱…',
                            filled: true,
                            fillColor: AppColors.surface,
                            contentPadding: const EdgeInsets.fromLTRB(
                              4,
                              10,
                              4,
                              10,
                            ),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(22),
                              borderSide: const BorderSide(
                                color: AppColors.line,
                              ),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(22),
                              borderSide: const BorderSide(
                                color: AppColors.line,
                              ),
                            ),
                            prefixIcon: widget.onPickKnowledgeBase == null
                                ? null
                                : IconButton(
                                    tooltip: '知识库',
                                    icon: const Icon(
                                      Icons.layers_outlined,
                                      color: AppColors.inkSoft,
                                    ),
                                    onPressed: widget.disabled
                                        ? null
                                        : widget.onPickKnowledgeBase,
                                  ),
                            suffixIcon: _modeToggle(),
                            suffixIconConstraints: const BoxConstraints(
                              minWidth: 44,
                              minHeight: 44,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      IconButton.filled(
                        style: IconButton.styleFrom(
                          backgroundColor: widget.disabled || widget.streaming
                              ? AppColors.line
                              : AppColors.accentDeep,
                          foregroundColor: Colors.white,
                          disabledBackgroundColor: AppColors.line,
                        ),
                        tooltip: '发送',
                        onPressed: widget.disabled || widget.streaming
                            ? null
                            : widget.onSend,
                        icon: widget.streaming
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.arrow_upward, size: 20),
                      ),
                    ],
                  ),
          ],
        ),
      ),
    );
  }
}
