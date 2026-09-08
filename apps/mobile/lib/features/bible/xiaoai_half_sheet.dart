/// 读经半屏小爱 v3.1：多轮 thread、Chip 追问、与 PWA 对齐。
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../app/app_shell.dart' show navIndexProvider;
import '../../core/badge_stats.dart';
import '../../core/config.dart';
import '../../core/theme.dart';
import '../assistant/answer_text.dart';
import '../assistant/assistant_format.dart';
import '../assistant/assistant_markdown.dart';
import '../assistant/assistant_reader_context.dart';
import '../assistant/assistant_repository.dart';
import '../assistant/assistant_scenes.dart';
import '../assistant/assistant_seed.dart';
import '../assistant/citation_evidence_rail.dart';
import '../assistant/models.dart' as am;
import '../assistant/models.dart' show Citation;
import 'half_sheet_chips.dart';
import 'half_sheet_thread.dart';
import 'reader_sheet.dart';
import 'reader_thoughts_sheet.dart';
import 'xiaoai_halfsheet_cache.dart';

AssistantScene resolveHalfSheetInitialScene(
  bool explicitSelection,
  String selectionText,
) {
  final sel = explicitSelection ? selectionText.trim() : '';
  return sel.isNotEmpty ? AssistantScene.verseFull : AssistantScene.verseQuick;
}

String buildHalfSheetUserQuestion(String refLabel, String selectionText) {
  final snippet = selectionText.trim();
  if (snippet.isNotEmpty) {
    final short =
        snippet.length > 80 ? '${snippet.substring(0, 80)}…' : snippet;
    return '请解读：$refLabel\n「$short」';
  }
  return '请解读：$refLabel';
}

class HalfSheetTurnView {
  HalfSheetTurnView({
    required this.id,
    required this.userQuestion,
    required this.answer,
    required this.citations,
    required this.scene,
    required this.followups,
    this.busy = false,
    this.streamIncomplete = false,
    this.useRag,
    this.kbId,
    this.kbName,
  });

  final String id;
  String userQuestion;
  String answer;
  List<Citation> citations;
  AssistantScene scene;
  List<String> followups;
  bool busy;
  bool streamIncomplete;
  bool? useRag;
  String? kbId;
  String? kbName;
}

class XiaoAiHalfSheet extends ConsumerStatefulWidget {
  const XiaoAiHalfSheet({
    super.key,
    required this.refStr,
    required this.refLabel,
    this.selectionText = '',
    this.explicitSelection = true,
  });

  final String refStr;
  final String refLabel;
  final String selectionText;
  final bool explicitSelection;

  @override
  ConsumerState<XiaoAiHalfSheet> createState() => _XiaoAiHalfSheetState();
}

class _XiaoAiHalfSheetState extends ConsumerState<XiaoAiHalfSheet> {
  static const _emptyAnswerMsg = '⚠️ 未收到回答，请重试';

  late final AssistantScene _initialScene;
  late final String _selectionKey;
  late final String _userQuestion;
  late final List<HalfSheetChipDef> _l1Chips;

  final _scrollCtrl = ScrollController();
  final _turns = <HalfSheetTurnView>[];
  String? _activeTurnId;
  int _runId = 0;
  final _expandedTurns = <String, bool>{};
  String? _copiedTurnId;
  StreamSubscription<am.ChatEvent>? _sub;

  @override
  void initState() {
    super.initState();
    _initialScene = resolveHalfSheetInitialScene(
      widget.explicitSelection,
      widget.selectionText,
    );
    _selectionKey = halfSheetSelectionKey(
      widget.refStr,
      widget.selectionText,
      widget.explicitSelection,
    );
    _userQuestion = buildHalfSheetUserQuestion(
      widget.refLabel,
      widget.explicitSelection ? widget.selectionText : '',
    );
    _l1Chips = halfSheetL1Chips(widget.refLabel);

    final saved = readHalfSheetThread(widget.refStr, _selectionKey);
    if (saved != null && saved.turns.isNotEmpty) {
      for (final t in saved.turns) {
        _turns.add(
          HalfSheetTurnView(
            id: t.id,
            userQuestion: t.userQuestion,
            answer: t.answer,
            citations: t.citations,
            scene: t.scene,
            followups: t.followups,
          ),
        );
      }
      _activeTurnId = saved.turns.last.id;
    }

    ref.read(badgeStatsRecorderProvider).recordHalfSheetXiaoAi();
    ref
        .read(badgeStatsRecorderProvider)
        .recordXiaoAiQuestion(scene: _initialScene.id, ref: widget.refStr);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_turns.isEmpty) _startInitialTurn();
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _persistThread() {
    final done = _turns
        .where((t) => !t.busy && t.answer.trim().isNotEmpty)
        .map(
          (t) => HalfSheetTurn(
            id: t.id,
            userQuestion: t.userQuestion,
            answer: t.answer,
            citations: t.citations,
            scene: t.scene,
            followups: t.followups,
          ),
        )
        .toList();
    if (done.isEmpty) return;
    writeHalfSheetThread(
      HalfSheetThread(
        ref: widget.refStr,
        selectionKey: _selectionKey,
        turns: done,
      ),
    );
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollCtrl.hasClients) return;
      _scrollCtrl.animateTo(
        _scrollCtrl.position.maxScrollExtent,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    });
  }

  void _startInitialTurn({bool isRetry = false}) {
    final turnId = newHalfSheetTurnId();
    setState(() {
      _turns
        ..clear()
        ..add(
          HalfSheetTurnView(
            id: turnId,
            userQuestion: _userQuestion,
            answer: '',
            citations: const [],
            scene: _initialScene,
            followups: const [],
            busy: true,
          ),
        );
      _activeTurnId = turnId;
      _expandedTurns[turnId] = true;
    });
    _runChat(turnId, _userQuestion, _initialScene, isRetry: isRetry);
  }

  void _runChat(
    String turnId,
    String question,
    AssistantScene scene, {
    bool isRetry = false,
    List<am.ChatTurn> history = const [],
  }) {
    _sub?.cancel();
    final runId = ++_runId;
    var pending = '';
    var scheduled = false;
    var gotDelta = false;
    var cites = <Citation>[];
    var serverFollowups = <String>[];
    bool? useRag;
    String? kbId;
    String? kbName;

    void flush() {
      scheduled = false;
      if (!mounted || runId != _runId) return;
      setState(() {
        final t = _turnFor(turnId);
        if (t != null) t.answer = pending;
      });
    }

    void scheduleFlush() {
      if (scheduled) return;
      scheduled = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => flush());
    }

    setState(() {
      final t = _turnFor(turnId);
      if (t != null) {
        t
          ..busy = true
          ..answer = ''
          ..streamIncomplete = false
          ..userQuestion = question
          ..scene = scene;
      }
    });

    final cacheSel = halfSheetCacheSelection(
      widget.selectionText,
      widget.explicitSelection,
    );
    final apiQuestion = scene == AssistantScene.verseFull ||
            scene == AssistantScene.verseQuick
        ? buildHalfSheetQuestion(
            question,
            widget.selectionText,
            widget.explicitSelection,
          )
        : question;

    if (!isRetry) {
      final cached = readHalfSheetCache(
        scene,
        widget.refStr,
        cacheSel,
        apiQuestion,
      );
      if (cached != null) {
        setState(() {
          final t = _turnFor(turnId);
          if (t != null) {
            t
              ..answer = cached.answer
              ..citations = cached.citations
              ..followups = defaultHalfSheetFollowups(widget.refLabel)
              ..busy = false
              ..streamIncomplete = false;
          }
        });
        _activeTurnId = turnId;
        _persistThread();
        _scrollToBottom();
        return;
      }
    }

    final mode = am.AssistantMode.fromId(scene.mode) ?? am.AssistantMode.explain;
    final stream = ref.read(assistantRepoProvider).chat(
          ref: widget.refStr,
          question: apiQuestion,
          mode: mode,
          scene: scene,
          history: history,
          readerContext: buildAssistantReaderContext(ref),
          surface: 'half_sheet',
        );

    _sub = stream.listen(
      (evt) {
        if (!mounted || runId != _runId) return;
        switch (evt) {
          case am.MetaEvent(:final meta):
            cites = meta.citations;
            useRag = meta.useRag;
            kbId = meta.knowledgeBaseId;
            kbName = meta.knowledgeBaseName;
            setState(() {
              final t = _turnFor(turnId);
              if (t != null) {
                t
                  ..citations = cites
                  ..useRag = useRag
                  ..kbId = kbId
                  ..kbName = kbName;
              }
            });
          case am.DeltaEvent(:final text):
            pending += text;
            if (!gotDelta) {
              gotDelta = true;
              flush();
            } else {
              scheduleFlush();
            }
          case am.FollowupsEvent(:final items):
            if (items.isNotEmpty) serverFollowups = items;
          case am.ErrorEvent(:final message):
            if (pending.trim().isNotEmpty) {
              setState(() {
                final t = _turnFor(turnId);
                if (t != null) {
                  t
                    ..answer = pending
                    ..busy = false
                    ..streamIncomplete = true;
                }
              });
              _persistThread();
              return;
            }
            setState(() {
              final t = _turnFor(turnId);
              if (t != null) {
                t
                  ..answer = '⚠️ $message'
                  ..busy = false;
              }
            });
          case am.DoneEvent(:final followups):
            var text = pending.trim();
            if (text.isEmpty) text = _emptyAnswerMsg;
            final streamOk =
                !text.startsWith('⚠️') && text != _emptyAnswerMsg;
            final structOk = scene == AssistantScene.verseFull ||
                    scene == AssistantScene.verseQuick
                ? isHalfSheetAnswerComplete(text, scene)
                : true;
            final followupItems = followups.isNotEmpty
                ? followups
                : serverFollowups.isNotEmpty
                    ? serverFollowups
                    : defaultHalfSheetFollowups(widget.refLabel);
            setState(() {
              final t = _turnFor(turnId);
              if (t != null) {
                t
                  ..answer = text
                  ..citations = cites.isNotEmpty ? cites : t.citations
                  ..followups = followupItems
                  ..busy = false
                  ..streamIncomplete = !streamOk || !structOk
                  ..useRag = useRag
                  ..kbId = kbId
                  ..kbName = kbName;
              }
            });
            if (streamOk && structOk) {
              writeHalfSheetCache(
                scene,
                widget.refStr,
                cacheSel,
                apiQuestion,
                text,
                cites,
              );
            }
            _activeTurnId = turnId;
            _persistThread();
            _scrollToBottom();
          default:
            break;
        }
      },
      onDone: () {
        if (!mounted || runId != _runId) return;
        setState(() {
          final t = _turnFor(turnId);
          if (t == null || !t.busy) return;
          if (pending.trim().isEmpty && t.answer.trim().isEmpty) {
            t.answer = _emptyAnswerMsg;
          } else if (pending.trim().isNotEmpty) {
            t.answer = pending;
          }
          t.busy = false;
        });
      },
      onError: (_) {
        if (!mounted || runId != _runId) return;
        setState(() {
          final t = _turnFor(turnId);
          if (t == null) return;
          if (t.answer.isEmpty && pending.isEmpty) {
            t.answer = '⚠️ 请求超时，请重试或前往小爱 Tab 继续对话';
          } else {
            t.answer = pending;
            t.streamIncomplete = true;
          }
          t.busy = false;
        });
      },
    );

    Future.delayed(Duration(milliseconds: scene.timeoutMs), () {
      if (!mounted || runId != _runId) return;
      final t = _turnFor(turnId);
      if (t == null || !t.busy) return;
      _sub?.cancel();
      setState(() {
        if (pending.isEmpty && t.answer.isEmpty) {
          t.answer = '⚠️ 请求超时，请重试或前往小爱 Tab 继续对话';
        } else {
          t.answer = pending;
          t.streamIncomplete = true;
        }
        t.busy = false;
      });
    });
  }

  HalfSheetTurnView? _turnFor(String id) {
    for (final t in _turns) {
      if (t.id == id) return t;
    }
    return null;
  }

  void _appendTurn(String question, AssistantScene scene) {
    if (_turns.length >= 3 || _turns.any((t) => t.busy)) return;
    final history = _turns
        .where((t) =>
            t.answer.trim().isNotEmpty && !t.answer.trim().startsWith('⚠️'))
        .expand(
          (t) => [
            am.ChatTurn(role: 'user', content: t.userQuestion),
            am.ChatTurn(role: 'assistant', content: bodyText(t.answer)),
          ],
        )
        .toList();
    final turnId = newHalfSheetTurnId();
    setState(() {
      _turns.add(
        HalfSheetTurnView(
          id: turnId,
          userQuestion: question,
          answer: '',
          citations: const [],
          scene: scene,
          followups: const [],
          busy: true,
        ),
      );
      _activeTurnId = turnId;
      _expandedTurns[turnId] = true;
    });
    _scrollToBottom();
    _runChat(turnId, question, scene, history: history);
  }

  void _continueWithAssistant() {
    Navigator.of(context).pop();
    final seedTurns = _turns
        .where((t) =>
            t.answer.trim().isNotEmpty && !t.answer.trim().startsWith('⚠️'))
        .toList();
    final seeds = <AssistantSeedMessage>[];
    for (final t in seedTurns) {
      final clean = bodyText(t.answer);
      final used = citationsUsedInText(clean, t.citations);
      seeds.add(AssistantSeedMessage(role: 'user', text: t.userQuestion));
      seeds.add(
        AssistantSeedMessage(
          role: 'assistant',
          text: clean,
          citations: used,
        ),
      );
    }
    ref.read(assistantSeedProvider.notifier).open(
          ref: widget.refStr,
          question: seeds.isEmpty ? _userQuestion : null,
          seedMessages: seeds,
        );
    ref.read(navIndexProvider.notifier).set(2);
  }

  Future<void> _copyAnswer(String turnId, String raw) async {
    final text = bodyText(raw);
    if (text.isEmpty || text.startsWith('⚠️')) return;
    await Clipboard.setData(ClipboardData(text: text));
    if (!mounted) return;
    setState(() => _copiedTurnId = turnId);
    Future.delayed(const Duration(milliseconds: 1800), () {
      if (mounted) setState(() => _copiedTurnId = null);
    });
  }

  Future<void> _saveAsThought() async {
    await showWriteThoughtSheet(
      context,
      ref,
      refStr: widget.refStr,
      refLabel: widget.refLabel,
      verseText: widget.selectionText.trim().isEmpty
          ? null
          : widget.selectionText.trim(),
    );
  }

  Future<void> _shareAnalysis(String text) async {
    final clean = bodyText(text).trim();
    if (clean.isEmpty || clean.startsWith('⚠️')) return;
    var payload = clean;
    try {
      final id = await ref
          .read(assistantRepoProvider)
          .createAnalysisShareSnapshot(
            answerMarkdown: clean,
            refLabel: widget.refLabel,
            refParam: widget.refStr,
          );
      if (id != null && id.isNotEmpty) {
        final base = AppConfig.webBaseUrl.replaceAll(RegExp(r'/+$'), '');
        payload = '$clean\n$base/share/analysis/$id';
      }
    } catch (_) {
      /* 快照失败则纯文案 */
    }
    try {
      await SharePlus.instance.share(ShareParams(text: payload));
    } catch (_) {
      await Clipboard.setData(ClipboardData(text: payload));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('已复制，可粘贴分享'),
          duration: Duration(milliseconds: 1500),
        ),
      );
    }
  }

  void _openCitation(Citation citation) {
    ref.read(badgeStatsRecorderProvider).recordCitationClick();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _HalfSheetCitationDetail(citation: citation),
    );
  }

  @override
  Widget build(BuildContext context) {
    final completedTurns =
        _turns.where((t) => !t.busy && t.answer.trim().isNotEmpty).toList();
    final activeTurn = _activeTurnId != null ? _turnFor(_activeTurnId!) : null;
    final chipTurn = activeTurn != null && !activeTurn.busy
        ? activeTurn
        : completedTurns.isNotEmpty
            ? completedTurns.last
            : null;
    final followupCount = _turns.where((t) {
      final idx = _turns.indexOf(t);
      return t.scene.id.startsWith('chat_') || idx > 0;
    }).length;
    final deepChatEmphasis = followupCount >= 2;
    final chipsDisabled = _turns.any((t) => t.busy) || _turns.length >= 3;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 8, 6),
          child: Row(
            children: [
              const Text(
                '小爱解经',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                  color: AppColors.ink,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.accentWash,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  widget.refLabel,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.accentDeep,
                  ),
                ),
              ),
              const Spacer(),
              ReaderSheetCloseButton(
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        ),
        const Divider(height: 1, color: AppColors.line),
        Expanded(
          child: SingleChildScrollView(
            controller: _scrollCtrl,
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_turns.length > 1)
                  ..._turns.take(_turns.length - 1).map((t) {
                    return Theme(
                      data: Theme.of(context).copyWith(
                        dividerColor: Colors.transparent,
                      ),
                      child: ExpansionTile(
                        tilePadding: EdgeInsets.zero,
                        title: Text(
                          t.userQuestion.length > 28
                              ? '${t.userQuestion.substring(0, 28)}…'
                              : t.userQuestion,
                          style: const TextStyle(fontSize: 13),
                        ),
                        children: [
                          AssistantMarkdownBody(
                            text: bodyText(t.answer),
                            dense: true,
                          ),
                        ],
                      ),
                    );
                  }),
                if (_turns.isNotEmpty) ...[
                  for (var i = 0; i < _turns.length; i++)
                    if (i == _turns.length - 1) _buildTurn(_turns[i], i),
                ],
                if (chipTurn != null &&
                    !chipTurn.busy &&
                    !chipTurn.answer.trim().startsWith('⚠️'))
                  HalfSheetChipRows(
                    followups: chipTurn.followups,
                    followupsLoading: false,
                    l1Chips: _l1Chips,
                    disabled: chipsDisabled,
                    onFollowup: (q) => _appendTurn(
                      q,
                      chipTurn.scene.id.startsWith('chat_')
                          ? chipTurn.scene
                          : AssistantScene.chatExplain,
                    ),
                    onL1: (chip) => _appendTurn(chip.q, chip.scene),
                  )
                else if (chipTurn?.busy == true)
                  HalfSheetChipRows(
                    followups: const [],
                    followupsLoading: true,
                    l1Chips: _l1Chips,
                    disabled: true,
                    onFollowup: (_) {},
                    onL1: (_) {},
                  ),
              ],
            ),
          ),
        ),
        if (chipTurn != null &&
            !chipTurn.busy &&
            !chipTurn.answer.trim().startsWith('⚠️'))
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: OutlinedButton(
                onPressed: _continueWithAssistant,
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(40),
                  foregroundColor: AppColors.accentDeep,
                  backgroundColor: deepChatEmphasis
                      ? AppColors.accentWash
                      : null,
                  side: BorderSide(
                    color: deepChatEmphasis
                        ? AppColors.accentDeep
                        : AppColors.line,
                    width: deepChatEmphasis ? 1.5 : 1,
                  ),
                ),
                child: const Text(
                  '与小爱深聊 ›',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ),
      ],
    );
  }

  String _thinkingLabel(HalfSheetTurnView turn) {
    if (turn.citations.isNotEmpty) {
      return '已找到 ${turn.citations.length} 条释经资料，正在组织回答…';
    }
    return '正在阅读这节经文…';
  }

  Widget _buildTurn(HalfSheetTurnView turn, int index) {
    final rawAnswer = turn.answer.trim();
    final waitingFirstToken = turn.busy && rawAnswer.isEmpty;
    final clean = bodyText(turn.answer);
    final hasError = clean.startsWith('⚠️');
    final usedCitations = citationsUsedInText(clean, turn.citations);
    final evidenceCites =
        usedCitations.isNotEmpty ? usedCitations : turn.citations;
    final summaryLead = extractSummaryLead(clean);
    final expanded = _expandedTurns[turn.id] != false;
    final showCollapsed = !expanded &&
        !hasError &&
        summaryLead.summary.isNotEmpty &&
        summaryLead.body.length > 20;
    final displayText = prepareAssistantDisplay(
      turn.answer.isEmpty ? (turn.busy ? '' : _emptyAnswerMsg) : turn.answer,
      streaming: turn.busy,
    );
    final done = !turn.busy && clean.isNotEmpty && !hasError;
    final bookName = widget.refLabel.split(' ').first;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Align(
          alignment: Alignment.centerRight,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.sizeOf(context).width * 0.88,
            ),
            child: Container(
              margin: EdgeInsets.only(bottom: waitingFirstToken ? 8 : 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.goldWash.withValues(alpha: 0.7),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.line),
              ),
              child: Text(
                widget.selectionText.trim().isNotEmpty && index == 0
                    ? (widget.selectionText.trim().length > 120
                        ? '${widget.selectionText.trim().substring(0, 120)}…'
                        : widget.selectionText.trim())
                    : turn.userQuestion,
                textAlign: TextAlign.left,
                style: const TextStyle(
                  fontSize: 14,
                  height: 1.55,
                  color: AppColors.inkSoft,
                  fontFamily: 'Songti SC',
                  fontFamilyFallback: ['STSong', 'Noto Serif SC', 'serif'],
                ),
              ),
            ),
          ),
        ),
        if (waitingFirstToken)
          _HalfSheetThinkingState(label: _thinkingLabel(turn))
        else if (showCollapsed)
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AssistantMarkdownBody(text: summaryLead.summary, dense: true),
              TextButton(
                onPressed: () =>
                    setState(() => _expandedTurns[turn.id] = true),
                child: const Text('展开完整解读'),
              ),
            ],
          )
        else ...[
          if (!hasError && !turn.busy)
            _RagSourceStatusHalfSheet(
              count: evidenceCites.length,
              useRag: turn.useRag ?? false,
              knowledgeBaseId: turn.kbId,
              knowledgeBaseName: turn.kbName,
            ),
          AssistantMarkdownBody(
            text: displayText,
            streaming: turn.busy,
            dense: turn.scene == AssistantScene.verseQuick,
            onCitationTap: (n) {
              final citation =
                  turn.citations.where((c) => c.n == n).firstOrNull;
              if (citation != null) _openCitation(citation);
            },
          ),
          if (!turn.busy && !hasError && evidenceCites.isNotEmpty)
            CitationEvidenceRail(
              citations: evidenceCites,
              bookName: bookName,
              onOpen: (n) {
                final citation =
                    turn.citations.where((c) => c.n == n).firstOrNull;
                if (citation != null) _openCitation(citation);
              },
            ),
          if (done)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Wrap(
                spacing: 8,
                runSpacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  TextButton(
                    onPressed: () => _copyAnswer(turn.id, turn.answer),
                    style: TextButton.styleFrom(
                      padding: EdgeInsets.zero,
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: Text(
                      _copiedTurnId == turn.id ? '已复制' : '复制',
                      style: const TextStyle(fontSize: 12),
                    ),
                  ),
                  const Text('·', style: TextStyle(color: AppColors.inkFaint)),
                  TextButton(
                    onPressed: _saveAsThought,
                    style: TextButton.styleFrom(
                      padding: EdgeInsets.zero,
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: const Text('存想法', style: TextStyle(fontSize: 12)),
                  ),
                  if (evidenceCites.isNotEmpty) ...[
                    const Text('·',
                        style: TextStyle(color: AppColors.inkFaint)),
                    TextButton(
                      onPressed: () => _openCitation(evidenceCites.first),
                      style: TextButton.styleFrom(
                        padding: EdgeInsets.zero,
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: const Text('看来源', style: TextStyle(fontSize: 12)),
                    ),
                  ],
                  const Text('·', style: TextStyle(color: AppColors.inkFaint)),
                  TextButton(
                    onPressed: () => _shareAnalysis(turn.answer),
                    style: TextButton.styleFrom(
                      padding: EdgeInsets.zero,
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: const Text('分享', style: TextStyle(fontSize: 12)),
                  ),
                ],
              ),
            ),
          if (turn.streamIncomplete && !turn.busy)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Text(
                '解读可能未写完，可点「与小爱深聊」补全。',
                style: TextStyle(fontSize: 12, color: AppColors.inkFaint),
              ),
            ),
        ],
        if (hasError && !turn.busy)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: OutlinedButton(
              onPressed: () {
                setState(() {
                  _turns.clear();
                  _activeTurnId = null;
                });
                _startInitialTurn(isRetry: true);
              },
              child: const Text('重试'),
            ),
          ),
      ],
    );
  }
}

class _HalfSheetThinkingState extends StatelessWidget {
  const _HalfSheetThinkingState({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: AppColors.inkFaint,
              fontSize: 13,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 8),
          const _HalfSheetThinkingLine(widthFactor: 1),
          const SizedBox(height: 6),
          const _HalfSheetThinkingLine(widthFactor: 0.72),
        ],
      ),
    );
  }
}

class _HalfSheetThinkingLine extends StatelessWidget {
  const _HalfSheetThinkingLine({required this.widthFactor});

  final double widthFactor;

  @override
  Widget build(BuildContext context) {
    return FractionallySizedBox(
      widthFactor: widthFactor,
      alignment: Alignment.centerLeft,
      child: Container(
        height: 8,
        decoration: BoxDecoration(
          color: AppColors.line.withValues(alpha: 0.55),
          borderRadius: BorderRadius.circular(6),
        ),
      ),
    );
  }
}

class _RagSourceStatusHalfSheet extends StatelessWidget {
  const _RagSourceStatusHalfSheet({
    required this.count,
    required this.useRag,
    this.knowledgeBaseId,
    this.knowledgeBaseName,
  });

  final int count;
  final bool useRag;
  final String? knowledgeBaseId;
  final String? knowledgeBaseName;

  @override
  Widget build(BuildContext context) {
    if (!useRag) return const SizedBox.shrink();
    final isTopic =
        knowledgeBaseId != null && knowledgeBaseId != 'platform';
    final kbSuffix = isTopic && (knowledgeBaseName?.isNotEmpty ?? false)
        ? ' · $knowledgeBaseName'
        : '';
    final text = count > 0
        ? '已参考 $count 条释经资料$kbSuffix'
        : '本次以圣经与通识作答 · 资料库暂无直接对应注释$kbSuffix';
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 12,
          height: 1.4,
          color: AppColors.inkFaint,
        ),
      ),
    );
  }
}

class _HalfSheetCitationDetail extends ConsumerStatefulWidget {
  const _HalfSheetCitationDetail({required this.citation});
  final Citation citation;

  @override
  ConsumerState<_HalfSheetCitationDetail> createState() =>
      _HalfSheetCitationDetailState();
}

class _HalfSheetCitationDetailState
    extends ConsumerState<_HalfSheetCitationDetail> {
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
