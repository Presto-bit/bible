'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type EntityGraph, type GraphTopic } from '@/lib/api';
import { LocalRelationGraph } from '@/components/knowledge/LocalRelationGraph';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { graphTopicAssistantQuestion } from '@/lib/entity_knowledge';
import {
  estimateTourMinutes,
  knowledgeAskQuestion,
  nextInExodusSeries,
  tourHook,
} from '@/lib/knowledge_story';
import {
  resumeKnowledgeStep,
  saveKnowledgeProgress,
} from '@/lib/knowledge_progress';
import PageBackBar from '@/components/PageBackBar';
import { useFlowBack } from '@/lib/use_edge_swipe_back';
import { KnowledgeStoryEnd } from '@/components/search/KnowledgeStoryEnd';
import { KnowledgeAskSheet } from '@/components/search/KnowledgeAskSheet';

const NARRATIVE_EDGE_MAX = 12;

export function GraphTopicView({
  topicId,
  backHref = '/search',
  backLabel = '搜索',
}: {
  topicId: string;
  backHref?: string;
  backLabel?: string;
}) {
  const router = useRouter();
  const goBack = useFlowBack(backHref);
  const [topic, setTopic] = useState<GraphTopic | null>(null);
  const [graph, setGraph] = useState<EntityGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ osis: string; label: string } | null>(null);
  const [step, setStep] = useState(0);
  const [askOpen, setAskOpen] = useState(false);
  const [askMode, setAskMode] = useState<'beat' | 'topic'>('beat');
  const [resumedFrom, setResumedFrom] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    setStep(0);
    setResumedFrom(null);
    setAskOpen(false);
    void api
      .graphTopic(topicId)
      .then((d) => {
        setTopic(d.topic);
        const center = d.graph.nodes.find((n) => (d.topic.entity_ids ?? []).includes(n.id))
          ?? d.graph.nodes[0];
        setGraph({
          center: center
            ? { id: center.id, name: center.name, type: center.type, summary: '', refs: [] }
            : null,
          nodes: d.graph.nodes,
          edges: d.graph.edges,
        });
        const beatsLen = d.topic.beats?.length ?? 0;
        const resume = resumeKnowledgeStep('graph', topicId);
        if (resume != null && resume > 0 && resume < beatsLen) {
          setStep(resume);
          setResumedFrom(resume);
        }
      })
      .catch(() => {
        setTopic(null);
        setGraph(null);
      })
      .finally(() => setLoading(false));
  }, [topicId]);

  const beats = topic?.beats ?? [];
  const stepped = beats.length > 0;

  useEffect(() => {
    if (!topic || !stepped) return;
    saveKnowledgeProgress('graph', topicId, {
      step,
      total: beats.length,
      completed: step >= beats.length - 1,
    });
  }, [topic, topicId, step, stepped, beats.length]);

  const handleRefClick = (osis: string, label: string) => {
    const href = readerHrefFromRef(osis);
    if (href) window.location.href = href;
    else setPreview({ osis, label });
  };

  if (loading) {
    return <p className="muted">正在载入关系专题…</p>;
  }
  if (!topic || !graph) {
    return (
      <p className="muted">
        未找到该专题。
        <a href="/search/graph"> 返回列表 ›</a>
      </p>
    );
  }

  const useNarrative = graph.edges.length <= NARRATIVE_EDGE_MAX;
  const current = stepped ? beats[step] : null;
  const isLast = stepped && step >= beats.length - 1;
  const hook = tourHook(topic.id);
  const mins = stepped ? estimateTourMinutes(beats.length) : null;
  const askQ =
    askMode === 'topic'
      ? graphTopicAssistantQuestion(topic)
      : knowledgeAskQuestion({
          title: topic.title,
          stopLabel: current?.label,
          askSeed: current?.ask_seed,
          ref: current?.ref,
        });

  return (
    <>
      <header className="page-head story-mode-head">
        <PageBackBar onClick={goBack} label={backLabel} />
        <h2 className="page-head-title">{topic.title}</h2>
      </header>
      {topic.subtitle || mins != null ? (
        <p className="muted story-mode-sub">
          {[topic.subtitle, mins != null ? `约 ${mins} 分钟` : null].filter(Boolean).join(' · ')}
        </p>
      ) : null}
      {(!stepped || step === 0) && hook ? (
        <p className="story-mode-hook">{hook}</p>
      ) : null}
      {(!stepped || step === 0) && topic.description ? (
        <p className="story-mode-lead" style={{ marginBottom: 12 }}>{topic.description}</p>
      ) : null}
      {resumedFrom != null && stepped && step === resumedFrom ? (
        <p className="muted story-mode-resume">已从第 {resumedFrom + 1} 段继续</p>
      ) : null}

      <div className="story-mode-actions" style={{ marginTop: 0, marginBottom: 12 }}>
        <button
          type="button"
          className="font-pill accent"
          onClick={() => {
            setAskMode('topic');
            setAskOpen(true);
          }}
        >
          问小爱理清关系
        </button>
      </div>

      {stepped && current ? (
        <>
          <div className="story-mode-progress" aria-live="polite">
            第 <strong>{step + 1}</strong> / {beats.length} 段 · {current.label}
          </div>
          <div className="card card-2 story-mode-card">
            <strong className="story-mode-stop-title">{current.label}</strong>
            {current.note ? <p className="story-mode-stop-note">{current.note}</p> : null}
          </div>
          <div className="story-mode-actions">
            {current.ref ? (
              <button
                type="button"
                className="font-pill accent"
                onClick={() => handleRefClick(current.ref!, formatGroupRefLabel(current.ref) || current.ref!)}
              >
                读这段 · {formatGroupRefLabel(current.ref) || current.ref}
              </button>
            ) : null}
            <button
              type="button"
              className="font-pill"
              onClick={() => {
                setAskMode('beat');
                setAskOpen(true);
              }}
            >
              问小爱
            </button>
            {!isLast ? (
              <button type="button" className="font-pill" onClick={() => setStep((s) => s + 1)}>
                下一段 · {beats[step + 1]?.label} ›
              </button>
            ) : null}
            {step > 0 ? (
              <button type="button" className="text-link story-mode-back-step" onClick={() => setStep((s) => s - 1)}>
                ‹ 上一段
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {(!stepped || isLast) && useNarrative ? (
        <ol className="relation-narrative-list" style={{ marginTop: stepped ? 16 : 0 }}>
          {graph.edges.map((edge, idx) => {
            const from = graph.nodes.find((n) => n.id === edge.from);
            const to = graph.nodes.find((n) => n.id === edge.to);
            const ref = edge.refs?.[0];
            return (
              <li key={`${edge.from}-${edge.to}-${idx}`} className="card card-2 relation-narrative-card">
                <p className="relation-narrative-line">
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => router.push(`/graph/${encodeURIComponent(edge.from)}`)}
                  >
                    {from?.name ?? edge.from}
                  </button>
                  <span className="relation-narrative-mid"> {edge.label || '相关'} </span>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => router.push(`/graph/${encodeURIComponent(edge.to)}`)}
                  >
                    {to?.name ?? edge.to}
                  </button>
                </p>
                {ref ? (
                  <button
                    type="button"
                    className="story-step-cta"
                    onClick={() => handleRefClick(ref, formatGroupRefLabel(ref) || ref)}
                  >
                    读这段 · {formatGroupRefLabel(ref) || ref}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {(!stepped || isLast) && !useNarrative ? (
        <LocalRelationGraph
          graph={graph}
          variant="fullscreen"
          onNodeClick={(nodeId) => {
            if (graph.center?.id === nodeId) return;
            router.push(`/graph/${encodeURIComponent(nodeId)}`);
          }}
          onRefClick={handleRefClick}
        />
      ) : null}

      {(!stepped || isLast) ? (
        <KnowledgeStoryEnd
          title={topic.title}
          related={topic.related}
          seriesNext={nextInExodusSeries('graph', topic.id)}
          listHref="/search/graph"
          listLabel="切换其他关系专题 ›"
          onAsk={() => {
            setAskMode(current ? 'beat' : 'topic');
            setAskOpen(true);
          }}
          onRestart={() => {
            if (stepped) {
              setResumedFrom(null);
              setStep(0);
              saveKnowledgeProgress('graph', topicId, {
                step: 0,
                total: beats.length,
                completed: false,
              });
            } else {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          restartLabel={stepped ? '回到第一段' : '回到顶部'}
          share={{
            kind: 'graph',
            id: topic.id,
            highlight: current?.note || hook || topic.subtitle || topic.description,
            stopCount: stepped ? beats.length : undefined,
            unit: '段',
          }}
        />
      ) : null}

      {askOpen ? (
        <KnowledgeAskSheet
          title={topic.title}
          question={askQ}
          refParam={askMode === 'beat' ? current?.ref : undefined}
          onClose={() => setAskOpen(false)}
        />
      ) : null}

      {preview ? (
        <VersePreviewSheet
          refParam={preview.osis}
          refLabel={preview.label}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </>
  );
}
