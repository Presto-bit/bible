'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { DictEntity, EntityKnowledge } from '@/lib/api';
import { entityDisplayName, entitySummaryText, entityTypeLabel } from '@/lib/dictionary_match';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { refSpaceToOsis } from '@/lib/inline_ref';
import {
  ENTITY_KNOWLEDGE_TAB_LABEL,
  type EntityKnowledgeTab,
} from '@/lib/entity_knowledge';
import { GeoMiniMap } from './GeoMiniMap';
import { LocalRelationGraph } from './LocalRelationGraph';
import { DiagramViewer } from './DiagramViewer';

export function EntityKnowledgePanel({
  entity,
  knowledge,
  loading,
  tab,
  onTabChange,
  tabs,
  onRefPreview,
  onNodeClick,
  graphTopicId,
}: {
  entity: DictEntity;
  knowledge: EntityKnowledge | null;
  loading: boolean;
  tab: EntityKnowledgeTab;
  onTabChange: (tab: EntityKnowledgeTab) => void;
  tabs: EntityKnowledgeTab[];
  onRefPreview: (osis: string, label: string) => void;
  onNodeClick?: (entityId: string) => void;
  graphTopicId?: string | null;
}) {
  const mapPlaces = knowledge?.place ? [knowledge.place] : [];

  return (
    <>
      <p className="entity-knowledge-summary">{entitySummaryText(entity)}</p>

      {tabs.length > 1 ? (
        <div className="entity-knowledge-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`entity-knowledge-tab${tab === t ? ' is-active' : ''}`}
              onClick={() => onTabChange(t)}
            >
              {ENTITY_KNOWLEDGE_TAB_LABEL[t]}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <p className="muted" style={{ fontSize: 13 }}>加载中…</p>
      ) : (
        <div className="entity-knowledge-panel">
          {tab === 'graph' && knowledge?.graph ? (
            <div>
              <LocalRelationGraph
                graph={knowledge.graph}
                onNodeClick={onNodeClick}
                onRefClick={onRefPreview}
              />
              {graphTopicId ? (
                <Link
                  href={`/search/graph?topic=${encodeURIComponent(graphTopicId)}`}
                  className="entity-knowledge-tour-link"
                  style={{ display: 'inline-block', marginTop: 10 }}
                >
                  查看关系专题 ›
                </Link>
              ) : null}
            </div>
          ) : null}

          {tab === 'refs' ? (
            <div>
              {(entity.refs ?? []).length > 0 ? (
                <div className="share-actions">
                  {(entity.refs ?? []).slice(0, 12).map((r) => (
                    <button
                      key={r}
                      type="button"
                      className="font-pill"
                      onClick={() => onRefPreview(
                        r.includes('.') ? r : refSpaceToOsis(r),
                        formatGroupRefLabel(r) ?? r,
                      )}
                    >
                      {formatGroupRefLabel(r) ?? r}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ fontSize: 13 }}>暂无关联经节</p>
              )}
            </div>
          ) : null}

          {tab === 'map' ? (
            <div>
              {mapPlaces.length > 0 ? (
                <GeoMiniMap places={mapPlaces} activeId={knowledge?.place?.id} />
              ) : (
                <p className="muted" style={{ fontSize: 13 }}>暂无地图坐标</p>
              )}
              {(knowledge?.map_tours ?? []).length > 0 ? (
                <div style={{ marginTop: 10 }}>
                  <p className="muted" style={{ fontSize: 12, marginBottom: 6 }}>所属路线</p>
                  {knowledge!.map_tours.map((tour) => (
                    <Link
                      key={tour.id}
                      href={`/search/map?tour=${encodeURIComponent(tour.id)}`}
                      className="entity-knowledge-tour-link"
                    >
                      {tour.title} ›
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'diagram' && knowledge?.diagrams?.[0] ? (
            <DiagramViewer
              diagram={knowledge.diagrams[0]}
              onRefClick={(ref) => onRefPreview(
                ref.includes('.') ? ref : refSpaceToOsis(ref),
                formatGroupRefLabel(ref) ?? ref,
              )}
            />
          ) : null}
        </div>
      )}
    </>
  );
}

export function EntityKnowledgeHeader({
  entity,
  trailing,
}: {
  entity: DictEntity;
  trailing?: ReactNode;
}) {
  return (
    <div className="section-row" style={{ marginTop: 0 }}>
      <h3 style={{ margin: 0 }}>
        {entityDisplayName(entity)}
        {entityTypeLabel(entity.type) ? (
          <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
            {entityTypeLabel(entity.type)}
          </span>
        ) : null}
      </h3>
      {trailing}
    </div>
  );
}
