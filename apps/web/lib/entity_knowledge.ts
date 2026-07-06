import type { DictEntity, EntityKnowledge } from '@/lib/api';
import { refSpaceToOsis } from '@/lib/inline_ref';

export type EntityKnowledgeTab = 'graph' | 'refs' | 'map' | 'diagram';

export const ENTITY_KNOWLEDGE_TAB_LABEL: Record<EntityKnowledgeTab, string> = {
  graph: '关系',
  refs: '经节',
  map: '地图',
  diagram: '图鉴',
};

export function defaultEntityKnowledgeTab(
  entity: DictEntity,
  knowledge: EntityKnowledge | null,
): EntityKnowledgeTab {
  if (entity.type === 'person') return 'graph';
  if (entity.type === 'place') return 'map';
  if ((knowledge?.diagrams?.length ?? 0) > 0) return 'diagram';
  return 'refs';
}

export function entityKnowledgeTabVisible(
  tab: EntityKnowledgeTab,
  entity: DictEntity,
  knowledge: EntityKnowledge | null,
): boolean {
  if (tab === 'refs') return true;
  if (tab === 'graph') {
    return entity.type === 'person' || (knowledge?.graph?.edges?.length ?? 0) > 0;
  }
  if (tab === 'map') {
    return Boolean(knowledge?.place) || (knowledge?.map_tours?.length ?? 0) > 0;
  }
  if (tab === 'diagram') return (knowledge?.diagrams?.length ?? 0) > 0;
  return false;
}

export function entityKnowledgeTabs(
  entity: DictEntity,
  knowledge: EntityKnowledge | null,
): EntityKnowledgeTab[] {
  return (['graph', 'refs', 'map', 'diagram'] as EntityKnowledgeTab[]).filter((t) =>
    entityKnowledgeTabVisible(t, entity, knowledge),
  );
}

export function entityDictionaryHref(entity: DictEntity): string {
  const id = entity.id ?? entity.name;
  return `/dictionary/${encodeURIComponent(id)}`;
}

export function entityGraphHref(entityId: string): string {
  return `/graph/${encodeURIComponent(entityId)}`;
}

export function entityAnchorRef(entity: DictEntity): string {
  const raw = entity.refs?.[0];
  if (!raw) return 'GEN.1.1';
  return raw.includes('.') ? raw : refSpaceToOsis(raw);
}

export function entityAssistantQuestion(
  entity: DictEntity,
  opts?: {
    knowledge?: EntityKnowledge | null;
    readingRef?: string;
  },
): string {
  const typeHint =
    entity.type === 'person' ? '人物' : entity.type === 'place' ? '地点' : '词条';
  const lines = [
    `请介绍圣经中的${typeHint}「${entity.name}」，包括其在经文中的主要角色与意义。`,
  ];
  const summary = (entity.summary || '').trim();
  if (summary && /[\u4e00-\u9fff]/.test(summary)) {
    lines.push(`词条摘要：${summary.slice(0, 120)}${summary.length > 120 ? '…' : ''}`);
  }
  const neighbors = (opts?.knowledge?.graph?.edges ?? [])
    .slice(0, 6)
    .map((e) => `${e.peer_name ?? e.to}（${e.label || e.type}）`);
  if (neighbors.length) {
    lines.push(`相关关系：${neighbors.join('、')}`);
  }
  if (opts?.readingRef) {
    lines.push(`我当前在读：${opts.readingRef}`);
  }
  return lines.join('\n');
}

export function graphTopicAssistantQuestion(topic: {
  title: string;
  subtitle?: string;
  entity_ids?: string[];
}): string {
  const names = (topic.entity_ids ?? []).join('、');
  const scope = topic.subtitle ? `（${topic.subtitle}）` : '';
  return [
    `请帮我理清圣经关系专题「${topic.title}」${scope}中各人物/地点的关系脉络。`,
    names ? `涉及：${names}。` : '',
    '请按经文依据说明他们之间的主要关联，并建议阅读顺序。',
  ].filter(Boolean).join('\n');
}

export function graphTopicAnchorRef(topic: { entity_ids?: string[] }): string {
  const first = topic.entity_ids?.[0];
  if (!first) return 'GEN.1.1';
  return first.includes('.') ? first : 'GEN.1.1';
}
