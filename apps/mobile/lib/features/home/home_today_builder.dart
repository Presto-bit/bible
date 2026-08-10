/// 首页「今日推荐」数据构造 —— 对齐 Web `home_today_panel.ts`。
library;

import 'home_today_panel.dart';

class HomeTodayCampaign {
  const HomeTodayCampaign({
    required this.id,
    required this.tag,
    required this.title,
    required this.sub,
    required this.href,
    this.coverUrl,
  });
  final String id;
  final String tag;
  final String title;
  final String sub;
  final String href;
  final String? coverUrl;

  factory HomeTodayCampaign.fromJson(Map<String, dynamic> j) =>
      HomeTodayCampaign(
        id: '${j['id'] ?? ''}',
        tag: '${j['tag'] ?? j['badge'] ?? '活动'}',
        title: '${j['title'] ?? j['name'] ?? ''}',
        sub: '${j['sub'] ?? j['subtitle'] ?? j['cta'] ?? '进入活动'}',
        href: '${j['href'] ?? j['url'] ?? '/'}',
        coverUrl: j['coverUrl'] as String? ?? j['imageUrl'] as String?,
      );
}

class HomeTodayInput {
  const HomeTodayInput({
    this.resumeTitle,
    this.resumeSub,
    this.resumeBookId,
    this.resumeChapter,
    this.planTitle,
    this.planSub,
    this.planProgressPct,
    this.planBookId,
    this.planChapter,
    this.prayerTitle,
    this.groupTitle,
    this.groupSub,
    this.groupStatLabel,
    this.campaigns = const [],
    this.planDoneToday = false,
    this.readToday = false,
    this.welcomeBack = false,
  });

  final String? resumeTitle;
  final String? resumeSub;
  final String? resumeBookId;
  final int? resumeChapter;
  final String? planTitle;
  final String? planSub;
  final int? planProgressPct;
  final String? planBookId;
  final int? planChapter;
  final String? prayerTitle;
  final String? groupTitle;
  final String? groupSub;
  final String? groupStatLabel;
  final List<HomeTodayCampaign> campaigns;
  final bool planDoneToday;
  final bool readToday;
  final bool welcomeBack;
}

String _trimTitle(String text, [int max = 24]) {
  final t = text.trim();
  if (t.length <= max) return t;
  return '${t.substring(0, max - 1)}…';
}

String _trimSide(String text, [int max = 10]) {
  final t = text.trim();
  if (t.isEmpty) return '';
  if (t.length <= max) return t;
  return '${t.substring(0, max - 1)}…';
}

HomeTodaySlot _campaignPrimary(HomeTodayCampaign c) {
  final tag = c.tag.trim();
  final safeTag =
      tag.isEmpty || tag == '空白' || tag == '空白页' || tag == '未命名'
          ? '活动'
          : tag;
  return HomeTodaySlot(
    id: 'campaign-${c.id}',
    tag: safeTag,
    title: _trimTitle(c.title),
    sub: '',
    href: c.href,
    cta: (c.sub.isEmpty ? '进入活动' : c.sub).length > 14
        ? '${(c.sub.isEmpty ? '进入活动' : c.sub).substring(0, 13)}…'
        : (c.sub.isEmpty ? '进入活动' : c.sub),
    coverUrl: c.coverUrl,
  );
}

HomeTodaySlot _campaignSide(HomeTodayCampaign c) {
  final tag = c.tag.trim();
  final safeTag =
      tag.isEmpty || tag == '空白' || tag == '空白页' || tag == '未命名'
          ? '活动'
          : tag;
  return HomeTodaySlot(
    id: 'campaign-${c.id}',
    tag: safeTag,
    title: _trimSide(c.title),
    sub: '',
    href: c.href,
    cta: '进入',
  );
}

HomeTodaySlot _primaryFromInput(HomeTodayInput input) {
  final planDone =
      (input.planProgressPct ?? 0) >= 100 || input.planDoneToday;
  final hasPlan =
      input.planTitle != null && input.planTitle!.trim().isNotEmpty;
  final hasResume =
      input.resumeTitle != null && input.resumeTitle!.trim().isNotEmpty;

  if (input.welcomeBack && !planDone && !input.readToday) {
    if (hasPlan) {
      return HomeTodaySlot(
        id: 'plan',
        tag: '欢迎回来',
        title: _trimTitle(input.planTitle!),
        sub: _trimTitle(input.planSub ?? '从上次继续就好', 20),
        href: '/plans',
        cta: '继续',
        progressPct: input.planProgressPct,
      );
    }
    if (hasResume) {
      return HomeTodaySlot(
        id: 'resume',
        tag: '欢迎回来',
        title: _trimTitle(input.resumeTitle!),
        sub: '从上次继续就好',
        href: '/reader',
        cta: '继续',
      );
    }
  }

  if (hasPlan) {
    if (planDone) {
      return HomeTodaySlot(
        id: 'plan',
        tag: '计划',
        title: _trimTitle(input.planTitle!),
        sub: '今日已完成 · 可回顾',
        href: '/plans',
        cta: '看看',
        done: true,
        progressPct: 100,
      );
    }
    final pct = input.planProgressPct;
    final inProgress = pct != null && pct > 0;
    return HomeTodaySlot(
      id: 'plan',
      tag: '计划',
      title: _trimTitle(input.planTitle!),
      sub: _trimTitle(input.planSub ?? '', 20),
      href: '/plans',
      cta: inProgress ? '继续' : '开始',
      progressPct: pct,
    );
  }

  if (hasResume) {
    return HomeTodaySlot(
      id: 'resume',
      tag: input.readToday ? '已读' : '继续',
      title: _trimTitle(input.resumeTitle!),
      sub: input.readToday ? '今日已读 · 可继续' : '圣经 Tab 也可随时续读',
      href: '/reader',
      cta: input.readToday ? '再读' : '继续',
    );
  }

  return const HomeTodaySlot(
    id: 'suggest',
    tag: '自由读',
    title: '从约翰福音开始',
    sub: '想按日程再去选计划',
    href: '/reader?book=JHN&chapter=1',
    cta: '去读',
  );
}

bool _isGroupEmpty(String? title, String? sub) {
  final t = (title ?? '').trim();
  final s = (sub ?? '').trim();
  return t.isEmpty ||
      t == '邀请好友共读' ||
      t == '创建共读' ||
      s == '创建或加入';
}

HomeTodaySlot _groupSlot(HomeTodayInput input) {
  final t = input.groupTitle;
  final s = input.groupSub;
  if (_isGroupEmpty(t, s)) {
    return const HomeTodaySlot(
      id: 'group',
      tag: '共读',
      title: '创建共读',
      sub: '',
      href: '/discover',
      cta: '去创建',
    );
  }
  final status = t!.trim();
  final hint = (s ?? '').trim();
  final badge = input.groupStatLabel?.trim();

  if (status == '今日待打卡') {
    return HomeTodaySlot(
      id: 'group',
      tag: '共读',
      title: '待打卡',
      sub: '',
      href: '/discover',
      badge: badge,
      cta: '去打卡',
      pending: true,
    );
  }
  final taskMatch = RegExp(r'^(\d+)\s*个任务$').firstMatch(status);
  if (taskMatch != null) {
    return HomeTodaySlot(
      id: 'group',
      tag: '共读',
      title: '${taskMatch.group(1)} 个任务',
      sub: '',
      href: '/discover',
      badge: badge,
      cta: '去完成',
      pending: true,
    );
  }
  if (status == '今日共读已完成') {
    return const HomeTodaySlot(
      id: 'group',
      tag: '共读',
      title: '今日已完成',
      sub: '',
      href: '/discover',
      cta: '看看',
      done: true,
    );
  }
  final friendsMatch = RegExp(r'^(\d+)\s*位好友').firstMatch(status);
  if (friendsMatch != null || hint == '看看动态') {
    return HomeTodaySlot(
      id: 'group',
      tag: '共读',
      title: friendsMatch != null
          ? '${friendsMatch.group(1)} 位好友'
          : '看看动态',
      sub: '',
      href: '/discover',
      cta: '看看',
    );
  }
  if (hint == '今日已打卡') {
    return HomeTodaySlot(
      id: 'group',
      tag: '共读',
      title: '今日已打卡',
      sub: '',
      href: '/discover',
      badge: badge,
      cta: '进入',
      done: true,
    );
  }
  return HomeTodaySlot(
    id: 'group',
    tag: '共读',
    title: _trimSide(status),
    sub: '',
    href: '/discover',
    badge: badge,
    cta: '进入',
  );
}

HomeTodaySlot _prayerSlot(HomeTodayInput input) {
  final day = (input.prayerTitle ?? '').trim();
  if (day.isEmpty) {
    return const HomeTodaySlot(
      id: 'prayer',
      tag: '祷告',
      title: '开始祷告',
      sub: '',
      href: '/pray',
      cta: '去祷告',
    );
  }
  return HomeTodaySlot(
    id: 'prayer',
    tag: '祷告',
    title: _trimSide(day),
    sub: '',
    href: '/pray',
    cta: '去祷告',
  );
}

/// 固定三坑：主行动 | 共读 | 祷告；活动最多占 3 坑。
({HomeTodaySlot primary, HomeTodaySlot group, HomeTodaySlot prayer})
    buildHomeTodayPanel(HomeTodayInput input) {
  final camps = input.campaigns.take(3).toList();
  final primary =
      camps.isNotEmpty ? _campaignPrimary(camps[0]) : _primaryFromInput(input);
  var group = camps.length > 1 ? _campaignSide(camps[1]) : _groupSlot(input);
  var prayer = camps.length > 2 ? _campaignSide(camps[2]) : _prayerSlot(input);

  final resume = input.resumeTitle;
  final resumeDiffers = resume != null &&
      resume.isNotEmpty &&
      (input.resumeBookId != input.planBookId ||
          input.resumeChapter != input.planChapter);

  if (camps.length < 3 &&
      primary.id == 'plan' &&
      resumeDiffers &&
      (input.prayerTitle == null || input.prayerTitle!.isEmpty)) {
    prayer = HomeTodaySlot(
      id: 'resume',
      tag: '自由读',
      title: _trimSide(resume!),
      sub: '',
      href: '/reader',
      cta: '续读',
    );
  }

  return (primary: primary, group: group, prayer: prayer);
}
