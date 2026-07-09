/// 圣经知识闯关 · 关卡制问答。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/badge_stats.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'challenge_levels.dart';
import 'challenge_progress.dart';
import 'daily_quiz.dart';

class ChallengeScreen extends ConsumerStatefulWidget {
  const ChallengeScreen({super.key});

  @override
  ConsumerState<ChallengeScreen> createState() => _ChallengeScreenState();
}

class _ChallengeScreenState extends ConsumerState<ChallengeScreen> {
  ChallengeLevel? _activeLevel;
  List<QuestionBankEntry>? _bankPlay;
  String? _bankTitle;
  var _qIdx = 0;
  int? _picked;
  var _correctCount = 0;
  LevelProgress _prog = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _reloadProgress());
  }

  void _reloadProgress() {
    if (!mounted) return;
    setState(() => _prog = levelProgress(ref.read(prefsProvider)));
  }

  void _finishLevel(int correct) {
    final play = _activeLevel;
    if (play == null) return;
    markLevelProgress(
      ref.read(prefsProvider),
      play.id,
      correct,
      play.questions.length,
    );
    ref.read(badgeStatsRecorderProvider).recordMemoryReview();
    if (play.bookId != null) {
      clearPendingBookChallenge(ref.read(prefsProvider));
    }
    setState(() {
      _prog = levelProgress(ref.read(prefsProvider));
      _activeLevel = null;
      _qIdx = 0;
      _picked = null;
      _correctCount = 0;
    });
  }

  void _pick(int i) {
    final play = _activeLevel;
    if (play == null || _picked != null) return;
    final q = play.questions[_qIdx];
    setState(() => _picked = i);
    final ok = i == q.answer;
    final nextCorrect = _correctCount + (ok ? 1 : 0);
    if (_qIdx + 1 >= play.questions.length) {
      Future.delayed(const Duration(milliseconds: 700), () {
        if (mounted) _finishLevel(nextCorrect);
      });
    } else {
      Future.delayed(const Duration(milliseconds: 700), () {
        if (!mounted) return;
        setState(() {
          _correctCount = nextCorrect;
          _qIdx++;
          _picked = null;
        });
      });
    }
  }

  void _startLevel(ChallengeLevel lv) {
    setState(() {
      _activeLevel = lv;
      _bankPlay = null;
      _bankTitle = null;
      _qIdx = 0;
      _picked = null;
      _correctCount = 0;
    });
  }

  void _startBank(List<QuestionBankEntry> qs, String title) {
    if (qs.isEmpty) return;
    setState(() {
      _bankPlay = qs;
      _bankTitle = title;
      _activeLevel = null;
      _qIdx = 0;
      _picked = null;
      _correctCount = 0;
    });
  }

  Future<void> _startDaily() async {
    final qs = await dailyQuizQuestions(ref.read(prefsProvider));
    _startBank(qs, '每日问答');
  }

  Future<void> _startRandom() async {
    final qs = await randomQuizQuestions();
    _startBank(qs, '随机挑战');
  }

  Future<void> _startWrongReview() async {
    final qs = await wrongReviewQuestions(ref.read(prefsProvider));
    _startBank(qs, '错题重练');
  }

  void _pickBank(int i) {
    final play = _bankPlay;
    if (play == null || _picked != null) return;
    final q = play[_qIdx];
    setState(() => _picked = i);
    final ok = i == q.answer;
    final nextCorrect = _correctCount + (ok ? 1 : 0);
    recordAnswer(ref.read(prefsProvider), q.id, ok);
    if (_qIdx + 1 >= play.length) {
      Future.delayed(const Duration(milliseconds: 700), () {
        if (mounted) {
          setState(() {
            _bankPlay = null;
            _bankTitle = null;
            _qIdx = 0;
            _picked = null;
            _correctCount = 0;
          });
        }
      });
    } else {
      Future.delayed(const Duration(milliseconds: 700), () {
        if (!mounted) return;
        setState(() {
          _correctCount = nextCorrect;
          _qIdx++;
          _picked = null;
        });
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(prefsProvider);
    final levels = levelsIncludingPending(prefs);
    final summary = challengeSummary(prefs, levels);
    final pending = getPendingBookChallenge(prefs);
    final stats = answerStats(prefs);

    if (_bankPlay != null) {
      return _BankPlayView(
        title: _bankTitle ?? '问答',
        questions: _bankPlay!,
        qIdx: _qIdx,
        picked: _picked,
        onBack: () => setState(() => _bankPlay = null),
        onPick: _pickBank,
      );
    }

    if (_activeLevel != null) {
      return _PlayView(
        level: _activeLevel!,
        qIdx: _qIdx,
        picked: _picked,
        onBack: () => setState(() => _activeLevel = null),
        onPick: _pick,
      );
    }

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        title: const Text('圣经知识闯关'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        children: [
          _HeroCard(summary: summary, stats: stats),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              ActionChip(label: const Text('每日问答'), onPressed: () => _startDaily()),
              ActionChip(label: const Text('随机10题'), onPressed: () => _startRandom()),
              ActionChip(label: const Text('错题重练'), onPressed: () => _startWrongReview()),
            ],
          ),
          if (pending != null) ...[
            const SizedBox(height: 12),
            _PendingNudge(
              pending: pending,
              onStart: () {
                for (final lv in levels) {
                  if (lv.id == pending.levelId) {
                    _startLevel(lv);
                    break;
                  }
                }
              },
            ),
          ],
          const SizedBox(height: 16),
          _LevelGrid(
            levels: levels,
            prog: _prog,
            onTap: _startLevel,
          ),
        ],
      ),
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.summary, required this.stats});

  final ChallengeSummary summary;
  final ({int correct, int wrong, int total, int accuracyPct}) stats;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 64,
            height: 64,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CircularProgressIndicator(
                  value: summary.progressPct / 100,
                  strokeWidth: 5,
                  backgroundColor: AppColors.surfaceSunken,
                  color: AppColors.accent,
                ),
                Text(
                  '${summary.progressPct}%',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.accentDeep,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '已通关 ${summary.completedLevels} / ${summary.totalLevels} 关',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '题库正确率 ${stats.accuracyPct}% · 经典 ${summary.completedLevels}/${summary.totalLevels} 关',
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.inkFaint,
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

class _PendingNudge extends StatelessWidget {
  const _PendingNudge({required this.pending, required this.onStart});

  final PendingBookChallenge pending;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: AppColors.accentWash,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              '读完 ${pending.bookName}',
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.accentDeep,
              ),
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            '来一关巩固挑战，检验一下掌握程度？',
            style: TextStyle(fontSize: 14, height: 1.5, color: AppColors.ink),
          ),
          const SizedBox(height: 10),
          FilledButton(
            onPressed: onStart,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.accentDeep,
              foregroundColor: AppColors.surface,
            ),
            child: const Text('开始巩固关 ›'),
          ),
        ],
      ),
    );
  }
}

class _LevelGrid extends StatelessWidget {
  const _LevelGrid({
    required this.levels,
    required this.prog,
    required this.onTap,
  });

  final List<ChallengeLevel> levels;
  final LevelProgress prog;
  final void Function(ChallengeLevel) onTap;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 0.92,
      ),
      itemCount: levels.length,
      itemBuilder: (context, i) {
        final lv = levels[i];
        final p = prog[lv.id];
        final locked = i > 0 &&
            prog[levels[i - 1].id]?.done != true &&
            lv.bookId == null;
        final done = p?.done == true;

        return _LevelCard(
          level: lv,
          done: done,
          locked: locked,
          onTap: locked ? null : () => onTap(lv),
        );
      },
    );
  }
}

class _LevelCard extends StatelessWidget {
  const _LevelCard({
    required this.level,
    required this.done,
    required this.locked,
    this.onTap,
  });

  final ChallengeLevel level;
  final bool done;
  final bool locked;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: done ? AppColors.accentWash : AppColors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: done ? AppColors.accent.withValues(alpha: 0.35) : AppColors.line,
            ),
          ),
          child: Opacity(
            opacity: locked ? 0.45 : 1,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  done ? '✓' : level.icon,
                  style: const TextStyle(fontSize: 22),
                ),
                const SizedBox(height: 6),
                Text(
                  level.title,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  level.subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 11, color: AppColors.inkFaint),
                ),
                const Spacer(),
                Text(
                  locked ? '🔒 未解锁' : '${level.questions.length} 题',
                  style: TextStyle(
                    fontSize: 11,
                    color: locked ? AppColors.inkSoft : AppColors.inkFaint,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PlayView extends StatelessWidget {
  const _PlayView({
    required this.level,
    required this.qIdx,
    required this.picked,
    required this.onBack,
    required this.onPick,
  });

  final ChallengeLevel level;
  final int qIdx;
  final int? picked;
  final VoidCallback onBack;
  final void Function(int) onPick;

  @override
  Widget build(BuildContext context) {
    final q = level.questions[qIdx];
    final progress = (qIdx + (picked != null ? 1 : 0)) / level.questions.length;

    return Scaffold(
      backgroundColor: AppColors.paper,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 8),
              Row(
                children: [
                  TextButton(
                    onPressed: onBack,
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.accentDeep,
                      padding: EdgeInsets.zero,
                    ),
                    child: const Text('← 关卡'),
                  ),
                  const Spacer(),
                  Text(
                    '${level.title} · ${qIdx + 1}/${level.questions.length}',
                    style: const TextStyle(fontSize: 13, color: AppColors.inkFaint),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 4,
                  backgroundColor: AppColors.surfaceSunken,
                  color: AppColors.accent,
                ),
              ),
              const SizedBox(height: 16),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: AppColors.line),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: AppColors.accentWash,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          level.subtitle,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: AppColors.accentDeep,
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        q.question,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w600,
                          height: 1.5,
                          color: AppColors.ink,
                        ),
                      ),
                      const SizedBox(height: 16),
                      Expanded(
                        child: ListView.separated(
                          itemCount: q.options.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, i) {
                            final show = picked != null;
                            final isAns = i == q.answer;
                            final isPick = i == picked;
                            Color? bg;
                            Color border = AppColors.line;
                            if (show && isAns) {
                              bg = AppColors.accentWash;
                              border = AppColors.accent;
                            } else if (show && isPick && !isAns) {
                              bg = const Color(0xFFFCEAEA);
                              border = const Color(0xFFD88A8A);
                            }
                            return OutlinedButton(
                              onPressed: picked == null ? () => onPick(i) : null,
                              style: OutlinedButton.styleFrom(
                                alignment: Alignment.centerLeft,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 12,
                                ),
                                backgroundColor: bg,
                                side: BorderSide(color: border),
                                foregroundColor: AppColors.ink,
                              ),
                              child: Text(q.options[i]),
                            );
                          },
                        ),
                      ),
                      if (picked != null) ...[
                        const SizedBox(height: 14),
                        Text(
                          q.explain,
                          style: const TextStyle(
                            fontSize: 14,
                            height: 1.7,
                            color: AppColors.inkSoft,
                          ),
                        ),
                        if (q.ref != null) ...[
                          const SizedBox(height: 8),
                          TextButton(
                            onPressed: () => context.push('/reader?ref=${q.ref}'),
                            style: TextButton.styleFrom(
                              foregroundColor: AppColors.accentDeep,
                              padding: EdgeInsets.zero,
                            ),
                            child: const Text('查看经文 ›'),
                          ),
                        ],
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}

class _BankPlayView extends StatelessWidget {
  const _BankPlayView({
    required this.title,
    required this.questions,
    required this.qIdx,
    required this.picked,
    required this.onBack,
    required this.onPick,
  });

  final String title;
  final List<QuestionBankEntry> questions;
  final int qIdx;
  final int? picked;
  final VoidCallback onBack;
  final void Function(int) onPick;

  @override
  Widget build(BuildContext context) {
    final q = questions[qIdx];
    final progress = (qIdx + (picked != null ? 1 : 0)) / questions.length;

    return Scaffold(
      backgroundColor: AppColors.paper,
      appBar: AppBar(
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: onBack),
        title: Text('$title · ${qIdx + 1}/${questions.length}'),
      ),
      body: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: progress,
                minHeight: 4,
                backgroundColor: AppColors.surfaceSunken,
                color: AppColors.accent,
              ),
            ),
            const SizedBox(height: 16),
            Text(q.category, style: const TextStyle(fontSize: 12, color: AppColors.inkFaint)),
            const SizedBox(height: 8),
            Text(
              q.question,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600, height: 1.5),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: ListView.separated(
                itemCount: q.options.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, i) {
                  final show = picked != null;
                  final isAns = i == q.answer;
                  final isPick = i == picked;
                  Color? bg;
                  var border = AppColors.line;
                  if (show && isAns) {
                    bg = AppColors.accentWash;
                    border = AppColors.accent;
                  } else if (show && isPick && !isAns) {
                    bg = const Color(0xFFFCEAEA);
                    border = const Color(0xFFD88A8A);
                  }
                  return OutlinedButton(
                    onPressed: picked == null ? () => onPick(i) : null,
                    style: OutlinedButton.styleFrom(
                      alignment: Alignment.centerLeft,
                      backgroundColor: bg,
                      side: BorderSide(color: border),
                    ),
                    child: Text(q.options[i]),
                  );
                },
              ),
            ),
            if (picked != null) ...[
              const SizedBox(height: 12),
              Text(q.explain, style: const TextStyle(fontSize: 14, height: 1.6, color: AppColors.inkSoft)),
            ],
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}
