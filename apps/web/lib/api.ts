/** 后端 API 聚合出口：兼容旧 `import { api } from '@/lib/api'`；新代码优先 `@/lib/api/home` / `@/lib/api/bible`。 */

export {
  API_BASE,
  contentAssetUrl,
  getJson,
  authed,
  authHeaders,
  hasPassword,
  getSessionToken,
  setSessionToken,
  resetAccountEnsureCaches,
  ensureIdentityReady,
  ensureAccountReady,
  guestId,
  guestIdAsync,
  registrationYear,
  currentUserId,
  effectiveId,
  getUserName,
  changeUsername,
  reshuffleUsername,
  getBoundPhone,
  bindPhone,
  listDevices,
  unbindDevice,
  getDisplayName,
  isOnboarded,
  markOnboarded,
  usernameAvailable,
  setCredentials,
  changePassword,
  loginWithIdentifier,
  logout,
  startFreshAccount,
  listKnowledgeBases,
  browseKnowledgeBases,
  getKnowledgeBase,
  previewKnowledgeDocument,
  explainCitation,
  createAnalysisShareSnapshot,
  getAnalysisShareSnapshot,
  chatStream,
  getDeviceId,
  stableDeviceFingerprint,
  deviceIdToUserCode,
  isUserCode,
  USER_CODE_LEN,
  USER_CODE_RE,
  type BibleBook,
  type Verse,
  type DailyVerseTone,
  type DailyVerseArc,
  type DailyVerse,
  type DailyVerseReactPreset,
  type DailyVerseReactTopPreset,
  type DailyVerseReactFeedItem,
  type DailyVerseReactFeed,
  type DailyVerseReactResult,
  type HeroBCampaignPublic,
  type HomeBootstrap,
  type DailyDevotional,
  type PrayerToday,
  type BoundDevice,
  type Citation,
  type KnowledgeBaseFolder,
  type KnowledgeBaseSummary,
  type KnowledgeBaseBrowsePlatform,
  type KnowledgeBaseDetail,
  type KnowledgeDocumentPreview,
  type CitationExplainResult,
  type AnalysisShareSnapshot,
  type ChatHistoryTurn,
  type ChatReaderContext,
  type ChatStreamBody,
  type ChatMetaPayload,
  type ChatDonePayload,
  type ChatCallbacks,
} from './api_core';

export { fetchAiQuota, type AiQuota } from './api/ai';
export { bibleApi } from './api/bible';
export type {
  BibleSearchHit,
  BibleVersion,
  VerseRendition,
  CompareResult,
  GuideCard,
  GuideResult,
} from './api/bible';
export { homeApi } from './api/home';

import { getJson, authed, authHeaders, API_BASE, contentAssetUrl } from './api_core';
import { bibleApi } from './api/bible';
import { homeApi } from './api/home';

// ── 类型 ──
export interface Group {
  id: string;
  name: string;
  intro?: string | null;
  join_code: string;
  role: string;
  members: number;
  plan_id?: string | null;
  plan_title?: string | null;
  checked_in_today?: number;
  my_checked_in_today?: boolean;
  open_tasks?: number;
  plan_days_total?: number;
  plan_progress_pct?: number;
  plan_day_avg?: number;
  members_on_plan?: number;
  my_plan_day?: number;
}
export interface GroupTaskAttachment {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  url: string;
  created_at?: string | null;
}

export interface GroupTask {
  id: string;
  title: string;
  ref?: string | null;
  due_at?: string | null;
  completed?: boolean;
  pinned?: boolean;
  task_type?: string;
  completion_rule?: string;
  body?: string | null;
  status?: string;
  publish_at?: string | null;
  series_id?: string | null;
  series_day?: number | null;
  template_id?: string | null;
  source?: string;
  plan_id?: string | null;
  plan_day?: number | null;
  assignee_ids?: string[];
  attachments?: GroupTaskAttachment[];
}
export interface GroupMember {
  user_id?: string;
  name: string;
  role: string;
  checked_in_today?: boolean;
  plan_day?: number;
  is_me?: boolean;
  avatar_id?: string | null;
}
export interface GroupDetail {
  id: string;
  name: string;
  intro?: string | null;
  join_code: string;
  role: string;
  members: GroupMember[];
  tasks: GroupTask[];
  plan_id?: string | null;
  plan_title?: string | null;
  announcement?: string | null;
  checked_in_today?: number;
  my_checked_in_today?: boolean;
  open_tasks?: number;
  plan_days_total?: number;
  plan_progress_pct?: number;
  plan_day_avg?: number;
  members_on_plan?: number;
  my_plan_day?: number;
  icebreaker_done?: boolean;
  pinned_task_id?: string | null;
  muted?: boolean;
  weekly_checkins?: number;
  weekly_active_days?: number;
  allow_chat?: boolean;
}
export interface GroupMessage {
  id: string;
  author: string;
  mine: boolean;
  user_id?: string;
  kind: string;
  ref?: string | null;
  body?: string | null;
  reactions: Record<string, string[]>;
  created_at: string;
  task_id?: string | null;
  task_due_at?: string | null;
  my_task_done?: boolean;
  recalled?: boolean;
  mentions?: string[];
  reply_to_id?: string | null;
  attachments?: Array<{
    id: string;
    file_name?: string | null;
    mime?: string | null;
    size_bytes?: number | null;
    storage_key?: string | null;
    url?: string | null;
  }>;
  /** 客户端乐观发送 */
  pending?: boolean;
  sendFailed?: boolean;
  /** 已上传、待重发的媒体元数据 */
  retryMedia?: {
    storage_key: string;
    file_name?: string;
    mime?: string;
    size_bytes?: number;
    url?: string;
    body?: string;
    reply_to_id?: string;
    mentions?: string[];
  };
}
export interface DiscoverSummary {
  groups_pending_checkin: number;
  groups_pending_tasks: number;
  friends_checked_in_today: number;
  first_pending_group_id?: string | null;
}
export interface Friend {
  user_id: string;
  handle?: string | null;
  display_name?: string | null;
  avatar_id?: string | null;
  user_code?: string | null;
}
export interface ConversationItem {
  scope: 'group' | 'dm' | 'inbox_friends' | 'inbox_groups';
  ref_id: string;
  title: string;
  subtitle?: string | null;
  unread?: number;
  updated_at?: string | null;
  pinned?: boolean;
  muted?: boolean;
  badge?: string | null;
  role?: string;
  peer_user_id?: string;
  peer_avatar_id?: string | null;
}
export interface FriendRequestItem {
  id: string;
  from_user_id?: string;
  to_user_id?: string;
  message?: string | null;
  created_at?: string | null;
  handle?: string | null;
  display_name?: string | null;
  user_code?: string | null;
  status?: string | null;
}
export interface GroupInviteInboxItem {
  id: string;
  group_id: string;
  group_name: string;
  inviter_name: string;
  message: string;
  created_at?: string | null;
}
export interface PlanSummary {
  plan_id: string;
  title: string;
  type: string;
  days: number;
}

export interface OpsCampaignTemplate {
  id: string;
  name: string;
  domain: string;
  domainLabel?: string;
  tag: string;
  blurb: string;
  landing?: OpsCampaignLanding;
}

export interface OpsCampaignLanding {
  title?: string;
  body?: string;
  features?: {
    likes?: boolean;
    comments?: boolean;
    rsvp?: boolean;
    prayer?: boolean;
    prayerPrivate?: boolean;
    dayUnlock?: string;
    signup?: boolean;
    questions?: boolean;
    countdown?: boolean;
  };
  schedule?: {
    startsAt?: string;
    endsAt?: string;
    location?: string;
    onlineNote?: string;
  };
  days?: Array<{
    day: number;
    title?: string;
    body?: string;
    verseRef?: string;
    discussionHint?: string;
    locked?: boolean;
  }>;
  slots?: Array<{ id: string; title: string; limit: number }>;
  entries?: Array<{ id: string; title: string; sub?: string; href: string }>;
  primaryCta?: { label?: string; href?: string };
  /** 落地页积木顺序与内容（编辑器用） */
  blocks?: Array<{ id: string; type: string; data?: Record<string, unknown> }>;
}

export interface OpsCampaign {
  id: string;
  creatorId: string;
  name: string;
  templateId: string;
  status: string;
  startAt: string;
  endAt: string;
  coverUrl?: string | null;
  subtitle: string;
  railSlot: number;
  railEnabled: boolean;
  /** 今日推荐卡点击跳转；空则默认活动落地页。支持站内 /path 或 http(s) 外链 */
  railHref?: string;
  /** 解析后的首页卡 href（railHref 或默认落地页） */
  href?: string;
  priority: number;
  landing: OpsCampaignLanding;
  groupIds: string[];
  tag?: string;
  stats?: OpsCampaignStats;
  createdAt?: string | null;
  updatedAt?: string | null;
  audienceMode?: 'groups' | 'all' | 'admin_preview';
  heroEnabled?: boolean;
  heroImageUrl?: string | null;
  heroImageUrlDark?: string | null;
  heroImageVersion?: number;
  heroAlt?: string;
  heroBadge?: string;
  heroHref?: string;
}

export interface OpsCampaignComment {
  id: string;
  day?: number | null;
  userId: string;
  body: string;
  createdAt?: string | null;
}

export interface OpsCampaignDetail extends OpsCampaign {
  isCreator?: boolean;
  liked?: boolean;
  likesCount?: number;
  myRsvp?: string | null;
  readDays?: number[];
  rsvpStats?: Record<string, number>;
  comments?: OpsCampaignComment[];
  prayers?: Array<{ id: string; userId: string; body: string; createdAt?: string | null }>;
  unlockedDayCap?: number;
  interactionClosed?: boolean;
  slots?: Array<{
    id: string;
    title: string;
    limit: number;
    taken: number;
    remaining?: number | null;
  }>;
  mySlots?: string[];
  questions?: Array<{
    id: string;
    userId: string;
    body: string;
    answer?: string | null;
    createdAt?: string | null;
    answeredAt?: string | null;
  }>;
}

export interface OpsCampaignStats {
  opens: number;
  readers: number;
  rsvps: number;
  likes: number;
  comments?: number;
  prayers?: number;
  signups?: number;
  questions?: number;
}

export interface OpsHomeCampaign {
  id: string;
  name: string;
  templateId: string;
  tag: string;
  subtitle: string;
  coverUrl?: string | null;
  railSlot: number;
  href: string;
  railHref?: string;
  daysTotal: number;
  daysRead: number;
}

export interface OpsCampaignUpsert {
  id?: string;
  name: string;
  templateId: string;
  status: string;
  startAt: string;
  endAt: string;
  coverUrl?: string | null;
  subtitle?: string;
  railSlot?: number;
  railEnabled?: boolean;
  /** 今日推荐卡外链/深链；空=默认落地页 */
  railHref?: string;
  priority?: number;
  groupIds: string[];
  landing: OpsCampaignLanding;
  audienceMode?: 'groups' | 'all' | 'admin_preview';
  heroEnabled?: boolean;
  heroImageUrl?: string | null;
  heroImageUrlDark?: string | null;
  heroImageVersion?: number;
  heroAlt?: string;
  heroBadge?: string;
  heroHref?: string;
}

export interface GeneratedPlan {
  id: string;
  title: string;
  scope: string;
  days_count: number;
  chapters_total: number;
  days: { day: number; title: string; refs: string[]; date?: string }[];
  saved_at?: number;
  start_date?: string;
  end_date?: string;
  exclude_saturday?: boolean;
  exclude_sunday?: boolean;
}
export interface DictEntity {
  id?: string;
  name: string;
  type: string;
  summary: string;
  refs: string[];
  aliases?: string[];
  disambiguation?: string;
  testament?: 'OT' | 'NT' | 'BOTH';
  scope_books?: string[];
}
export interface CrossrefResult {
  ref?: string;
  label: string;
  related: { ref: string; text: string }[];
  count?: number;
}

export interface StrongsWord {
  position: number;
  word?: string;
  strongs?: string;
  lemma?: string;
  transliteration?: string;
  gloss?: string;
  morphology?: string;
}

export interface StrongsResult {
  ref?: string;
  book?: string;
  chapter?: number;
  verse?: number;
  words: StrongsWord[];
  entry?: {
    strongs: string;
    language: string;
    lemma?: string;
    transliteration?: string;
    gloss?: string;
  };
}

export interface TopicEntry {
  id: string;
  name: string;
  refs?: string[] | { ref: string; text: string }[];
  verse_count?: number;
}

export interface GeoPlace {
  id: string;
  name: string;
  type?: string;
  latitude: number;
  longitude: number;
  refs?: string[];
}

export interface TimelineChapter {
  book: string;
  chapter: number;
  year?: number;
  year_display?: string;
  era?: string;
  note?: string;
}

export interface MapTourStop {
  order: number;
  place_id: string;
  label: string;
  ref: string;
  note?: string;
  ask_seed?: string;
  place?: GeoPlace | null;
}

export interface KnowledgeRelatedRef {
  kind: 'map' | 'timeline' | 'graph' | 'diagram';
  id: string;
  label: string;
}

export interface MapTour {
  id: string;
  title: string;
  subtitle?: string;
  era?: string;
  description?: string;
  /** traditional = 传统示意路线，非考古定论 */
  confidence?: 'traditional' | 'approximate';
  related?: KnowledgeRelatedRef[];
  stops: MapTourStop[];
}

export interface TimelineTourEvent {
  order: number;
  book: string;
  chapter: number;
  verse?: number;
  ref?: string;
  year_display?: string;
  label: string;
  note?: string;
  ask_seed?: string;
}

export interface TimelineTour {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  related?: KnowledgeRelatedRef[];
  events: TimelineTourEvent[];
}

export interface BookSummary {
  book: string;
  name: string;
  testament: string;
  chapter_count: number;
  summary: string;
}

export interface ChapterSummary {
  book: string;
  chapter: number;
  summary: string;
}

export interface EntityRelation {
  from: string;
  to: string;
  type: string;
  label: string;
  refs?: string[];
  peer_id?: string;
  peer_name?: string;
  direction?: 'in' | 'out';
}

export interface EntityGraphNode {
  id: string;
  name: string;
  type: string;
}

export interface EntityGraph {
  center: DictEntity | null;
  edges: EntityRelation[];
  nodes: EntityGraphNode[];
}

export interface DiagramHotspot {
  id: string;
  label: string;
  x: number;
  y: number;
  ref?: string;
  note?: string;
  ask_seed?: string;
}

export interface BibleDiagram {
  id: string;
  title: string;
  category: string;
  file: string;
  entity_ids?: string[];
  refs?: string[];
  summary?: string;
  related?: KnowledgeRelatedRef[];
  hotspots?: DiagramHotspot[];
}

export interface EntityKnowledge {
  entity: DictEntity;
  graph: EntityGraph;
  place: GeoPlace | null;
  map_tours: MapTour[];
  diagrams: BibleDiagram[];
  has_relations?: boolean;
}

export interface GraphTopicBeat {
  label: string;
  note?: string;
  ref?: string;
  ask_seed?: string;
}

export interface GraphTopic {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  entity_ids?: string[];
  related?: KnowledgeRelatedRef[];
  beats?: GraphTopicBeat[];
}

export const api = {
  ...homeApi,
  ...bibleApi,
  // 内容
  plans: () => getJson<{ plans: PlanSummary[] }>('/content/plans'),
  planDetail: (planId: string) =>
    getJson<{ plan_id: string; title: string; type: string; days: unknown[] }>(
      `/content/plans/${encodeURIComponent(planId)}`,
    ),
  planScopes: () =>
    getJson<{ scopes: { id: string; label: string }[] }>('/content/plan-scopes'),

  campaignTemplates: () =>
    getJson<{
      templates: OpsCampaignTemplate[];
      domains?: Array<{ id: string; label: string }>;
    }>('/content/campaigns/templates', authHeaders()),
  campaignStaffGroups: () =>
    authed<{ groups: { id: string; name: string; role: string }[] }>('/content/campaigns/staff-groups'),
  myCampaigns: (status?: string) =>
    authed<{ campaigns: OpsCampaign[] }>(
      `/content/campaigns${status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : ''}`,
    ),
  homeCampaigns: () =>
    getJson<{ campaigns: OpsHomeCampaign[] }>('/content/campaigns/home', authHeaders()),
  getCampaign: (id: string, preview?: boolean) =>
    getJson<{
      ok?: boolean;
      denied?: boolean;
      message?: string;
      teaser?: { id: string; name: string; tag: string; status: string };
      campaign?: OpsCampaignDetail;
    }>(
      `/content/campaigns/${encodeURIComponent(id)}${preview ? '?preview=1' : ''}`,
      authHeaders(),
    ),
  createCampaign: (body: OpsCampaignUpsert) =>
    authed<{ campaign: OpsCampaign }>('/content/campaigns', { method: 'POST', body }),
  updateCampaign: (id: string, body: OpsCampaignUpsert) =>
    authed<{ campaign: OpsCampaign }>(`/content/campaigns/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body,
    }),
  copyCampaign: (id: string) =>
    authed<{ campaign: OpsCampaign }>(`/content/campaigns/${encodeURIComponent(id)}/copy`, {
      method: 'POST',
      body: {},
    }),
  extendCampaign: (id: string, days = 7) =>
    authed<{ campaign: OpsCampaign }>(
      `/content/campaigns/${encodeURIComponent(id)}/extend`,
      { method: 'POST', body: { days } },
    ),
  deleteCampaign: (id: string) =>
    authed<{ ok: boolean }>(`/content/campaigns/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  toggleCampaignLike: (id: string) =>
    authed<{ liked: boolean; likesCount: number }>(
      `/content/campaigns/${encodeURIComponent(id)}/like`,
      { method: 'POST', body: {} },
    ),
  addCampaignComment: (id: string, body: string, day?: number) =>
    authed<{ comment: OpsCampaignComment }>(
      `/content/campaigns/${encodeURIComponent(id)}/comments`,
      { method: 'POST', body: { body, day } },
    ),
  upsertCampaignRsvp: (id: string, status: 'yes' | 'no' | 'maybe') =>
    authed<{ myRsvp: string; rsvpStats: Record<string, number> }>(
      `/content/campaigns/${encodeURIComponent(id)}/rsvp`,
      { method: 'POST', body: { status } },
    ),
  addCampaignPrayer: (id: string, body: string) =>
    authed<{ ok: boolean; id: string }>(
      `/content/campaigns/${encodeURIComponent(id)}/prayer`,
      { method: 'POST', body: { body } },
    ),
  markCampaignDayRead: (id: string, day: number) =>
    authed<{ readDays: number[] }>(
      `/content/campaigns/${encodeURIComponent(id)}/day-read`,
      { method: 'POST', body: { day } },
    ),
  toggleCampaignSignup: (id: string, slotId: string) =>
    authed<{
      joined: boolean;
      slotId: string;
      taken: number;
      remaining: number | null;
      mySlots: string[];
    }>(`/content/campaigns/${encodeURIComponent(id)}/signup`, {
      method: 'POST',
      body: { slotId },
    }),
  askCampaignQuestion: (id: string, body: string) =>
    authed<{
      question: {
        id: string;
        userId: string;
        body: string;
        answer: string | null;
        createdAt?: string | null;
      };
    }>(`/content/campaigns/${encodeURIComponent(id)}/questions`, {
      method: 'POST',
      body: { body },
    }),
  answerCampaignQuestion: (id: string, questionId: string, answer: string) =>
    authed<{ ok: boolean; answer: string }>(
      `/content/campaigns/${encodeURIComponent(id)}/questions/${encodeURIComponent(questionId)}/answer`,
      { method: 'POST', body: { answer } },
    ),
  listUserCampaignTemplates: () =>
    authed<{
      templates: Array<{
        id: string;
        name: string;
        baseTemplateId: string;
        landing: OpsCampaignLanding;
      }>;
    }>('/content/campaigns/user-templates'),
  saveUserCampaignTemplate: (body: {
    name: string;
    baseTemplateId: string;
    landing: OpsCampaignLanding;
  }) =>
    authed<{ ok: boolean; id: string }>('/content/campaigns/user-templates', {
      method: 'POST',
      body,
    }),
  deleteUserCampaignTemplate: (id: string) =>
    authed<{ ok: boolean }>(
      `/content/campaigns/user-templates/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    ),

  generatePlan: (scope: string | null, days: number, theme?: string, customRefs?: string) =>
    authed<GeneratedPlan>('/content/generate-plan', {
      method: 'POST',
      body: { scope: scope || undefined, days, theme, custom_refs: customRefs || undefined },
    }),
  crossrefs: (ref: string) =>
    getJson<CrossrefResult>(`/content/crossrefs?ref=${encodeURIComponent(ref)}`),
  strongs: (ref: string) =>
    getJson<StrongsResult>(`/content/strongs?ref=${encodeURIComponent(ref)}`),
  /** 读经静默预热「解释这节」首答 */
  prewarmAnswer: (ref: string, opts?: { mode?: string; scene?: string }) =>
    authed<{ status: string; cache_source?: string }>('/ai/prewarm', {
      method: 'POST',
      body: {
        ref,
        mode: opts?.mode ?? 'explain',
        scene: opts?.scene ?? 'verse_full',
      },
    }).catch(() => ({ status: 'skipped' as const })),
  topics: (topic?: string) =>
    getJson<{ topics: TopicEntry[] } | TopicEntry>(
      topic ? `/content/topics?topic=${encodeURIComponent(topic)}` : '/content/topics',
    ),
  geography: (ref?: string, book?: string, chapter?: number) =>
    getJson<{ places: GeoPlace[] }>(
      book && chapter
        ? `/content/geography?book=${encodeURIComponent(book)}&chapter=${chapter}`
        : ref
          ? `/content/geography?ref=${encodeURIComponent(ref)}`
          : '/content/geography',
    ),
  timeline: (book?: string, chapter?: number) =>
    getJson<{ chapters?: TimelineChapter[]; timeline?: TimelineChapter | null }>(
      book && chapter
        ? `/content/timeline?book=${encodeURIComponent(book)}&chapter=${chapter}`
        : '/content/timeline',
    ),
  mapTours: () => getJson<{ tours: MapTour[] }>('/content/map-tours'),
  mapTour: (id: string) => getJson<{ tour: MapTour }>(`/content/map-tours/${encodeURIComponent(id)}`),
  timelineTours: () => getJson<{ tours: TimelineTour[] }>('/content/timeline-tours'),
  timelineTour: (id: string) =>
    getJson<{ tour: TimelineTour }>(`/content/timeline-tours/${encodeURIComponent(id)}`),
  bookSummaries: () => getJson<{ books: BookSummary[] }>('/content/summaries/books'),
  bookSummary: (book: string) =>
    getJson<{ summary: BookSummary }>(`/content/summaries/books/${encodeURIComponent(book)}`),
  chapterSummaries: (book: string, chapter?: number) =>
    getJson<{ chapters?: ChapterSummary[]; summary?: ChapterSummary | null }>(
      chapter
        ? `/content/summaries/chapters?book=${encodeURIComponent(book)}&chapter=${chapter}`
        : `/content/summaries/chapters?book=${encodeURIComponent(book)}`,
    ),
  relations: (entityId?: string) =>
    getJson<EntityGraph | { relations: EntityRelation[] }>(
      entityId
        ? `/content/relations?entity_id=${encodeURIComponent(entityId)}`
        : '/content/relations',
    ),
  entityKnowledge: (entityId: string, opts?: { graphLimit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.graphLimit) params.set('graph_limit', String(opts.graphLimit));
    const qs = params.toString();
    return getJson<EntityKnowledge>(
      `/content/entities/${encodeURIComponent(entityId)}/knowledge${qs ? `?${qs}` : ''}`,
    );
  },
  diagrams: () => getJson<{ schema?: string; categories?: { id: string; label: string }[]; items: BibleDiagram[] }>('/content/diagrams'),
  diagram: (id: string) => getJson<{ diagram: BibleDiagram }>(`/content/diagrams/${encodeURIComponent(id)}`),
  diagramFileUrl: (id: string) =>
    contentAssetUrl(`/content/diagrams/${encodeURIComponent(id)}/file`),
  graphTopics: () => getJson<{ topics: GraphTopic[] }>('/content/graph-topics'),
  graphTopic: (id: string) =>
    getJson<{ topic: GraphTopic; graph: { nodes: EntityGraphNode[]; edges: EntityRelation[] } }>(
      `/content/graph-topics/${encodeURIComponent(id)}`,
    ),
  contentAttribution: () =>
    getJson<{ sources: { id: string; name: string; license: string; url: string }[] }>(
      '/content/attribution',
    ),
  dictionary: (term?: string, ref?: string) =>
    getJson<{ entities: DictEntity[] }>(
      `/content/dictionary${term || ref ? `?${new URLSearchParams({
        ...(term ? { term } : {}),
        ...(ref ? { ref } : {}),
      }).toString()}` : ''}`,
    ),
  sectionTitles: (book?: string, chapter?: number) =>
    getJson<{ chapters?: Record<string, { verse: number; title: string }[]>; sections?: { verse: number; title: string }[] }>(
      book && chapter
        ? `/content/sections?book=${encodeURIComponent(book)}&chapter=${chapter}`
        : '/content/sections',
    ),
  paragraphRanges: () =>
    getJson<{ chapters?: Record<string, [number, number][]> }>('/content/paragraphs'),
  // 社交
  myGroups: () => authed<{ groups: Group[] }>('/social/groups'),
  discoverSummary: () => authed<DiscoverSummary>('/social/discover/summary'),
  pushDigest: () => authed<{ title: string; body: string; href: string; unread?: number }>('/social/push/digest'),
  deliverPushDigest: () => authed<{ ok: boolean; sent: number }>('/push/deliver-digest', { method: 'POST' }),
  createGroup: (name: string, intro?: string, plan_id?: string) =>
    authed<Group>('/social/groups', { method: 'POST', body: { name, intro, plan_id } }),
  createGroupFromPlan: (plan_id: string, name?: string) =>
    authed<Group>('/social/groups/from-plan', {
      method: 'POST',
      body: { plan_id, name },
    }),
  joinGroup: (join_code: string) =>
    authed<{ id: string; name: string }>('/social/groups/join', {
      method: 'POST',
      body: { join_code },
    }),
  groupDetail: (gid: string, opts?: { light?: boolean }) =>
    authed<GroupDetail>(
      `/social/groups/${gid}${opts?.light ? '?light=1' : ''}`,
    ),
  updateGroup: (
    gid: string,
    body: {
      name?: string;
      plan_id?: string | null;
      announcement?: string | null;
      clear_plan?: boolean;
    },
  ) =>
    authed<{ ok: boolean }>(`/social/groups/${gid}`, {
      method: 'PATCH',
      body,
    }),
  transferGroup: (gid: string, newOwnerId: string) =>
    authed<{ ok: boolean }>(`/social/groups/${gid}/transfer`, {
      method: 'POST',
      body: { new_owner_id: newOwnerId },
    }),
  removeGroupMember: (gid: string, userId: string) =>
    authed<{ ok: boolean }>(`/social/groups/${gid}/members/${userId}`, {
      method: 'DELETE',
    }),
  leaveGroup: (gid: string) =>
    authed<{ ok: boolean }>(`/social/groups/${gid}/members/me`, { method: 'DELETE' }),
  dissolveGroup: (gid: string) =>
    authed<{ ok: boolean }>(`/social/groups/${gid}`, { method: 'DELETE' }),
  updateGroupMemberName: (gid: string, display_name: string) =>
    authed<{ ok: boolean; display_name: string }>(`/social/groups/${gid}/members/me`, {
      method: 'PATCH',
      body: { display_name },
    }),
  groupFeed: (gid: string, opts?: { before?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (opts?.before) q.set('before', opts.before);
    if (opts?.limit) q.set('limit', String(opts.limit));
    const qs = q.toString();
    return authed<{ messages: GroupMessage[]; has_more: boolean }>(
      `/social/groups/${gid}/feed${qs ? `?${qs}` : ''}`,
    );
  },
  checkin: (gid: string, body: { body?: string; ref?: string; task_id?: string }) =>
    authed<{ id: string }>(`/social/groups/${gid}/checkin`, {
      method: 'POST',
      body,
    }),
  createTask: (
    gid: string,
    title: string,
    ref?: string,
    opts?: {
      due_at?: string;
      template_id?: string;
      task_type?: string;
      completion_rule?: string;
      body?: string;
      publish_at?: string;
      assignee_ids?: string[];
      attachments?: Array<{
        file_name: string;
        mime_type: string;
        size_bytes: number;
        storage_path: string;
        url: string;
      }>;
      series_days?: number;
      series_due_hours?: number;
    },
  ) =>
    authed<GroupTask & { ok?: boolean; series?: boolean; series_id?: string; task_ids?: string[] }>(
      `/social/groups/${gid}/tasks`,
      {
        method: 'POST',
        body: { title, ref, ...opts },
      },
    ),
  uploadTaskAttachment: async (gid: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/social/groups/${gid}/tasks/upload`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
      cache: 'no-store',
    });
    if (!res.ok) {
      let detail = `${res.status}`;
      try {
        detail = (await res.json()).detail || detail;
      } catch {
        /* ignore */
      }
      throw new Error(typeof detail === 'string' ? detail : '上传失败');
    }
    return res.json() as Promise<{
      ok: boolean;
      file_name: string;
      mime_type: string;
      size_bytes: number;
      storage_path: string;
      url: string;
    }>;
  },
  nudgeGroup: (gid: string) =>
    authed<{ ok: boolean; pending_members: number; message?: string }>(
      `/social/groups/${gid}/nudge`,
      { method: 'POST' },
    ),
  muteGroup: (gid: string, muted: boolean) =>
    authed<{ ok: boolean; muted: boolean }>(`/social/groups/${gid}/mute?muted=${muted ? 'true' : 'false'}`, {
      method: 'PATCH',
    }),
  pinTask: (gid: string, tid: string) =>
    authed<{ ok: boolean; pinned_task_id: string }>(`/social/groups/${gid}/tasks/${tid}/pin`, {
      method: 'PATCH',
    }),
  react: (mid: string, emoji: string) =>
    authed<{ reactions: Record<string, string[]> }>(`/social/messages/${mid}/react`, {
      method: 'POST',
      body: { emoji },
    }),
  reportMessage: (mid: string, reason?: string) =>
    authed<{ ok: boolean; reports: number; hidden: boolean }>(
      `/social/messages/${mid}/report`,
      { method: 'POST', body: { reason } },
    ),
  reportContent: (
    targetType: 'group_message' | 'dm' | 'group' | 'user',
    targetId: string,
    reason: 'spam' | 'abuse' | 'heresy' | 'illegal' | 'other',
    detail?: string,
  ) =>
    authed<{ id: string; status: string }>('/social/reports', {
      method: 'POST',
      body: {
        target_type: targetType,
        target_id: targetId,
        reason,
        ...(detail?.trim() ? { detail: detail.trim().slice(0, 500) } : {}),
      },
    }),
  deleteMessage: (mid: string) =>
    authed<{ ok: boolean }>(`/social/messages/${mid}`, { method: 'DELETE' }),
  reactMessage: (mid: string, emoji: string) =>
    authed<{ ok: boolean }>(`/social/messages/${mid}/react`, { method: 'POST', body: { emoji } }),
  sendGroupInvites: (gid: string, friendIds: string[]) =>
    authed<{ ok: boolean; sent: number }>(`/social/groups/${gid}/invites`, {
      method: 'POST',
      body: { friend_ids: friendIds },
    }),
  groupInviteInbox: () => authed<{ invites: GroupInviteInboxItem[] }>('/social/invites/inbox'),
  acceptGroupInvite: (id: string) =>
    authed<{ ok: boolean; group_id: string; name: string }>(`/social/invites/${id}/accept`, {
      method: 'POST',
    }),
  declineGroupInvite: (id: string) =>
    authed<{ ok: boolean }>(`/social/invites/${id}/decline`, { method: 'POST' }),
  friends: () => authed<{ friends: Friend[] }>('/social/friends'),
  socialMe: () =>
    authed<{
      user_id: string;
      user_code?: string | null;
      handle?: string | null;
      display_name?: string | null;
    }>('/social/me'),
  conversations: () => authed<{ items: ConversationItem[] }>('/social/conversations'),
  unreadCount: () => authed<{ unread: number }>('/social/unread-count'),
  friendRequests: () =>
    authed<{ incoming: FriendRequestItem[]; outgoing: FriendRequestItem[] }>(
      '/social/friend-requests',
    ),
  acceptFriendRequest: (id: string) =>
    authed<{ ok: boolean; friend_id?: string }>(`/social/friend-requests/${id}/accept`, {
      method: 'POST',
    }),
  declineFriendRequest: (id: string) =>
    authed<{ ok: boolean }>(`/social/friend-requests/${id}/decline`, { method: 'POST' }),
  openDm: (peerId: string) =>
    authed<{ thread_id: string; peer_user_id: string }>(`/social/dm/with/${peerId}`, {
      method: 'POST',
    }),
  dmMessages: (
    threadId: string,
    opts?: { limit?: number; before?: string },
  ) => {
    const limit = opts?.limit ?? 50;
    const q = new URLSearchParams({ limit: String(limit) });
    if (opts?.before) q.set('before', opts.before);
    return authed<{
      messages: DmMessage[];
      has_more?: boolean;
      peer_last_read_at?: string | null;
      peer_user_id?: string;
      peer_title?: string | null;
    }>(`/social/dm/${threadId}/messages?${q}`);
  },
  sendDm: (
    threadId: string,
    body: {
      body?: string;
      kind?: string;
      ref?: string;
      reply_to_id?: string;
      client_msg_id?: string;
    },
  ) =>
    authed<{ id: string; created_at?: string; deduped?: boolean }>(
      `/social/dm/${threadId}/messages`,
      {
        method: 'POST',
        body,
      },
    ),
  sendGroupChat: (
    gid: string,
    body: string,
    opts?: { replyToId?: string; mentions?: string[]; clientMsgId?: string },
  ) =>
    authed<{ id: string; created_at?: string; deduped?: boolean }>(
      `/social/groups/${gid}/chat`,
      {
        method: 'POST',
        body: {
          body,
          reply_to_id: opts?.replyToId,
          mentions: opts?.mentions,
          client_msg_id: opts?.clientMsgId,
        },
      },
    ),
  sendGroupVerse: (
    gid: string,
    body: { ref: string; body?: string; reply_to_id?: string },
  ) =>
    authed<{ id: string; created_at?: string }>(`/social/groups/${gid}/verse`, {
      method: 'POST',
      body,
    }),
  patchConversationState: (
    scope: string,
    refId: string,
    body: { last_read_at?: string; pinned?: boolean; muted?: boolean; hidden?: boolean },
  ) =>
    authed<{ ok: boolean }>(`/social/conversations/${scope}/${refId}/state`, {
      method: 'PATCH',
      body,
    }),
  recallMessage: (mid: string) =>
    authed<{ ok: boolean }>(`/social/messages/${mid}/recall`, { method: 'POST' }),
  realtimeCursor: () =>
    authed<{ group_max?: string | null; dm_max?: string | null; server_time: string }>(
      '/social/realtime/cursor',
    ),
  searchMessages: (
    q: string,
    opts?: { scope?: 'group' | 'dm'; refId?: string; limit?: number },
  ) => {
    const params = new URLSearchParams({ q });
    if (opts?.scope) params.set('scope', opts.scope);
    if (opts?.refId) params.set('ref_id', opts.refId);
    if (opts?.limit) params.set('limit', String(opts.limit));
    return authed<{
      items: Array<{
        scope: string;
        message_id: string;
        ref_id: string;
        title: string;
        kind: string;
        snippet: string;
        created_at?: string | null;
      }>;
    }>(`/social/search/messages?${params}`);
  },
  uploadSocialMedia: (
    file: File,
    opts?: { onProgress?: (pct: number) => void },
  ) =>
    new Promise<{
      ok: boolean;
      kind: string;
      file_name: string;
      mime_type: string;
      size_bytes: number;
      storage_key: string;
      url: string;
    }>((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/social/uploads`);
      const headers = authHeaders();
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable || !opts?.onProgress) return;
        opts.onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          opts?.onProgress?.(100);
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error('上传响应异常'));
          }
          return;
        }
        let detail = `${xhr.status}`;
        try {
          detail = JSON.parse(xhr.responseText).detail || detail;
        } catch {
          /* ignore */
        }
        reject(new Error(typeof detail === 'string' ? detail : '上传失败'));
      };
      xhr.onerror = () => reject(new Error('网络异常，上传失败'));
      xhr.send(form);
    }),
  /** 资料头像：持久 storage_key，不走 IM 24h 签名链 */
  uploadProfileAvatar: (
    file: File,
    opts?: { onProgress?: (pct: number) => void },
  ) =>
    new Promise<{
      ok: boolean;
      kind: string;
      file_name: string;
      mime_type: string;
      size_bytes: number;
      storage_key: string;
      url: string;
      avatar_id?: string;
    }>((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/social/uploads/avatar`);
      const headers = authHeaders();
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable || !opts?.onProgress) return;
        opts.onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          opts?.onProgress?.(100);
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error('上传响应异常'));
          }
          return;
        }
        let detail = `${xhr.status}`;
        try {
          detail = JSON.parse(xhr.responseText).detail || detail;
        } catch {
          /* ignore */
        }
        reject(new Error(typeof detail === 'string' ? detail : '上传失败'));
      };
      xhr.onerror = () => reject(new Error('网络异常，上传失败'));
      xhr.send(form);
    }),
  sendGroupMedia: (
    gid: string,
    body: {
      storage_key: string;
      file_name?: string;
      mime?: string;
      size_bytes?: number;
      url?: string;
      body?: string;
      mentions?: string[];
      reply_to_id?: string;
    },
  ) =>
    authed<{ id: string; kind: string }>(`/social/groups/${gid}/media`, {
      method: 'POST',
      body,
    }),
  sendDmMedia: (
    threadId: string,
    body: {
      storage_key: string;
      file_name?: string;
      mime?: string;
      size_bytes?: number;
      url?: string;
      body?: string;
      reply_to_id?: string;
      client_msg_id?: string;
    },
  ) =>
    authed<{ id: string; kind: string; deduped?: boolean }>(
      `/social/dm/${threadId}/media`,
      {
        method: 'POST',
        body,
      },
    ),
  previewSocialMedia: async (storageKey: string) => {
    const res = await fetch(
      `${API_BASE}/social/media/preview?storage_key=${encodeURIComponent(storageKey)}`,
      { headers: authHeaders() },
    );
    if (!res.ok) {
      let detail = `${res.status}`;
      try {
        const j = await res.json();
        detail = j.detail || detail;
      } catch {
        /* ignore */
      }
      throw new Error(typeof detail === 'string' ? detail : '预览失败');
    }
    return res.blob();
  },
  setAllowChat: (gid: string, allow_chat: boolean) =>
    authed<{ ok: boolean }>(`/social/groups/${gid}/allow-chat`, {
      method: 'PATCH',
      body: { allow_chat },
    }),
  setGroupAdmins: (gid: string, user_ids: string[]) =>
    authed<{ ok: boolean }>(`/social/groups/${gid}/admins`, {
      method: 'POST',
      body: { user_ids },
    }),
  addFriend: (handle: string, message?: string) =>
    authed<{
      id?: string;
      status?: string;
      to_user_id?: string;
      friend_id?: string;
      pending?: boolean;
      message?: string;
    }>('/social/friends', {
      method: 'POST',
      body: { handle, ...(message?.trim() ? { message: message.trim() } : {}) },
    }),
  removeFriend: (friendId: string) =>
    authed<{ ok: boolean }>(`/social/friends/${friendId}`, { method: 'DELETE' }),
  groupPendingInvites: (gid: string) =>
    authed<{ friend_ids: string[] }>(`/social/groups/${gid}/invites/pending`),
  cancelGroupInvite: (gid: string, friendId: string) =>
    authed<{ ok: boolean }>(`/social/groups/${gid}/invites/${friendId}`, { method: 'DELETE' }),
  listGroupPrayers: (gid: string, status: 'open' | 'answered' | 'archived' | 'mine' = 'open') =>
    authed<{ items: Array<{
      id: string;
      group_id: string;
      author_id: string;
      title: string;
      body: string;
      privacy: 'group' | 'staff';
      status: 'open' | 'answered' | 'archived';
      tag: string;
      answered_note: string;
      answered_at?: string | null;
      created_at?: string | null;
      claim_count: number;
      claimed_by_me: boolean;
    }> }>(`/social/groups/${gid}/prayers?status=${status}`),
  createGroupPrayer: (
    gid: string,
    body: { title: string; body?: string; privacy?: 'group' | 'staff'; tag?: string },
  ) =>
    authed<{ item: unknown }>(`/social/groups/${gid}/prayers`, { method: 'POST', body }),
  claimGroupPrayer: (gid: string, pid: string) =>
    authed<{ ok: boolean }>(`/social/groups/${gid}/prayers/${pid}/claim`, { method: 'POST' }),
  unclaimGroupPrayer: (gid: string, pid: string) =>
    authed<{ ok: boolean }>(`/social/groups/${gid}/prayers/${pid}/claim`, { method: 'DELETE' }),
  answerGroupPrayer: (gid: string, pid: string, body?: { note?: string }) =>
    authed<{ item: unknown }>(`/social/groups/${gid}/prayers/${pid}/answer`, {
      method: 'POST',
      body: body || {},
    }),
};

export interface DmMessage {
  id: string;
  sender_id: string;
  kind: string;
  body?: string | null;
  ref?: string | null;
  reply_to_id?: string | null;
  recalled?: boolean;
  created_at?: string | null;
  mine?: boolean;
  reactions?: Record<string, string[]>;
  attachments?: Array<{
    id: string;
    file_name?: string | null;
    mime?: string | null;
    size_bytes?: number | null;
    storage_key?: string | null;
    url?: string | null;
  }>;
  pending?: boolean;
  sendFailed?: boolean;
  retryText?: string;
  retryMedia?: {
    storage_key: string;
    file_name?: string;
    mime?: string;
    size_bytes?: number;
    url?: string;
    body?: string;
    reply_to_id?: string;
  };
}
