'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { SheetCloseButton } from '@/components/PageBackBar';
import { api, type DictEntity, type EntityKnowledge } from '@/lib/api';
import {
  entitySenseLabel,
  hasAlternateSenses,
  type DictContext,
} from '@/lib/dictionary_match';
import { navigateToAssistant } from '@/lib/assistant_prefill';
import {
  defaultEntityKnowledgeTab,
  entityAnchorRef,
  entityAssistantQuestion,
  entityDictionaryHref,
  entityKnowledgeTabs,
  type EntityKnowledgeTab,
} from '@/lib/entity_knowledge';
import { EntityKnowledgeHeader, EntityKnowledgePanel } from './EntityKnowledgePanel';

export function EntityKnowledgeSheet({
  entity,
  name,
  candidates,
  ctx,
  onClose,
  onPickEntity,
  onRefPreview,
  onNodeClick,
}: {
  entity: DictEntity;
  name: string;
  candidates: DictEntity[];
  ctx: DictContext;
  onClose: () => void;
  onPickEntity: (entity: DictEntity, remember: boolean) => void;
  onRefPreview: (osis: string, label: string) => void;
  onNodeClick?: (entityId: string) => void;
}) {
  const [knowledge, setKnowledge] = useState<EntityKnowledge | null>(null);
  const [graphTopicId, setGraphTopicId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<EntityKnowledgeTab>('refs');

  const entityId = entity.id ?? entity.name;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api
      .entityKnowledge(entityId)
      .then((data) => {
        if (cancelled) return;
        setKnowledge(data);
        setTab(defaultEntityKnowledgeTab(entity, data));
      })
      .catch(() => {
        if (!cancelled) setKnowledge(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
  }, [entityId, entity]);

  useEffect(() => {
    void api
      .graphTopics()
      .then((d) => {
        const hit = (d.topics ?? []).find((t) =>
          (t.entity_ids ?? []).includes(entityId),
        );
        setGraphTopicId(hit?.id ?? null);
      })
      .catch(() => setGraphTopicId(null));
  }, [entityId]);

  const tabs = useMemo(
    () => entityKnowledgeTabs(entity, knowledge),
    [entity, knowledge],
  );

  const askAssistant = () => {
    navigateToAssistant(entityAnchorRef(entity), {
      question: entityAssistantQuestion(entity),
      autoSend: true,
    });
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card entity-knowledge-sheet" onClick={(e) => e.stopPropagation()}>
        <EntityKnowledgeHeader entity={entity} trailing={<SheetCloseButton onClick={onClose} />} />

        {hasAlternateSenses(candidates, ctx) && (
          <div className="dict-sense-row" role="tablist" aria-label="切换义项">
            <span className="muted dict-sense-hint">也可能是：</span>
            {candidates.map((c) => {
              const active = (c.id ?? c.name) === (entity.id ?? entity.name);
              const label = entitySenseLabel(c);
              return (
                <button
                  key={c.id ?? c.name}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`dict-sense-chip${active ? ' is-active' : ''}`}
                  onClick={() => onPickEntity(c, true)}
                >
                  {label.length > 14 ? `${label.slice(0, 14)}…` : label}
                </button>
              );
            })}
          </div>
        )}

        <EntityKnowledgePanel
          entity={entity}
          knowledge={knowledge}
          loading={loading}
          tab={tab}
          onTabChange={setTab}
          tabs={tabs}
          onRefPreview={onRefPreview}
          onNodeClick={onNodeClick}
          graphTopicId={graphTopicId}
        />

        <div className="entity-knowledge-foot">
          <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
            继续读经
          </button>
          <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={askAssistant}>
            问小爱
          </button>
          <Link
            href={entityDictionaryHref(entity)}
            className="btn"
            style={{ flex: 1, textAlign: 'center' }}
          >
            全屏查看
          </Link>
        </div>
      </div>
    </div>
  );
}
