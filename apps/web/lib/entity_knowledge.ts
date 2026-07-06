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

export function entityAnchorRef(entity: DictEntity): string {
  const raw = entity.refs?.[0];
  if (!raw) return 'GEN.1.1';
  return raw.includes('.') ? raw : refSpaceToOsis(raw);
}

export function entityAssistantQuestion(entity: DictEntity): string {
  const typeHint =
    entity.type === 'person' ? '人物' : entity.type === 'place' ? '地点' : '词条';
  return `请介绍圣经中的${typeHint}「${entity.name}」，包括其在经文中的主要角色与意义。`;
}
