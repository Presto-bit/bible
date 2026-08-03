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
  entityAnchorRef,
  entityAssistantQuestion,
  entityDictionaryHref,
  entityKnowledgeTabs,
  type EntityKnowledgeTab,
} from '@/lib/entity_knowledge';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { EntityKnowledgeHeader, EntityKnowledgePanel } from './EntityKnowledgePanel';
import AppBodyPortal from '@/components/AppBodyPortal';

/** 打开词典时复用，避免反复打 knowledge / graphTopics */
const knowledgeCache = new Map<string, EntityKnowledge>();
let graphTopicsPromise: Promise<{ id: string; entity_ids?: string[] }[] | null> | null = null;

function loadGraphTopics() {
  if (!graphTopicsPromise) {
    graphTopicsPromise = api
      .graphTopics()
      .then((d) => d.topics ?? [])
      .catch(() => {
        graphTopicsPromise = null;
        return null;
      });
  }
  return graphTopicsPromise;
}

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
  const entityId = entity.id ?? entity.name;
  const cached = knowledgeCache.get(entityId) ?? null;
  const [knowledge, setKnowledge] = useState<EntityKnowledge | null>(cached);
  const [graphTopicId, setGraphTopicId] = useState<string | null>(null);
  // 首开永远先出本地经节列表，不挂关系图（关系图重绘在安卓很卡）
  const [loading, setLoading] = useState(!cached);
  const [tab, setTab] = useState<EntityKnowledgeTab>('refs');

  useEffect(() => {
    let cancelled = false;
    const hit = knowledgeCache.get(entityId);
    if (hit) {
      setKnowledge(hit);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setTab('refs');

    void api
      .entityKnowledge(entityId)
      .then((data) => {
        if (cancelled) return;
        knowledgeCache.set(entityId, data);
        setKnowledge(data);
      })
      .catch(() => {
        if (!cancelled && !knowledgeCache.has(entityId)) setKnowledge(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // 专题链接次要：延后拉，且缓存全表
    const t = window.setTimeout(() => {
      void loadGraphTopics().then((topics) => {
        if (cancelled || !topics) return;
        const found = topics.find((topic) => (topic.entity_ids ?? []).includes(entityId));
        setGraphTopicId(found?.id ?? null);
      });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [entityId]);

  const tabs = useMemo(
    () => entityKnowledgeTabs(entity, knowledge),
    [entity, knowledge],
  );

  const askAssistant = () => {
    const readingRef = `${ctx.bookId} ${ctx.chapter}:${ctx.verse}`;
    navigateToAssistant(entityAnchorRef(entity), {
      question: entityAssistantQuestion(entity, {
        knowledge,
        readingRef: formatGroupRefLabel(readingRef) ?? readingRef,
      }),
      autoSend: true,
      scene: 'entity_knowledge',
    });
  };

  return (
    <AppBodyPortal onTabAway={onClose}>
      <div className="sheet-backdrop" onClick={onClose} data-dismiss-on-tab-nav>
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
    </AppBodyPortal>
  );
}
