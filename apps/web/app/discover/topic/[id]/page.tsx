'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { topicById, type LifeTopic } from '@/lib/discover_topics';
import { topicColor } from '@/lib/topics_display';
import { AssistantLink } from '@/components/AssistantLink';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { refSpaceToOsis } from '@/lib/inline_ref';

type VerseCard = { ref: string; text: string };

export default function TopicPage() {
  const params = useParams();
  const id = String(params.id || '');
  const staticTopic = topicById(id);
  const [apiVerses, setApiVerses] = useState<VerseCard[]>([]);
  const [apiName, setApiName] = useState<string | null>(null);
  const [loading, setLoading] = useState(!staticTopic);
  const [preview, setPreview] = useState<{ osis: string; label: string } | null>(null);

  useEffect(() => {
    if (staticTopic) return;
    let cancelled = false;
    void api
      .topics(id)
      .then((d) => {
        if (cancelled || !('refs' in d)) return;
        setApiName(d.name || id);
        const refs = (d.refs ?? []) as { ref: string; text?: string }[];
        setApiVerses(
          refs.slice(0, 12).map((r) => ({
            ref: r.ref.includes('.') ? r.ref : refSpaceToOsis(String(r.ref)),
            text: r.text || '（点击预览经文）',
          })),
        );
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, staticTopic]);

  const topic: LifeTopic | null = staticTopic ?? (apiName ? {
    id,
    title: apiName,
    subtitle: `${apiVerses.length || '…'} 节精选经文`,
    color: topicColor(id.charCodeAt(0) % 10),
    verses: apiVerses,
  } : null);

  if (loading) {
    return (
      <main className="container">
        <p className="muted">加载中…</p>
      </main>
    );
  }

  if (!topic) {
    return (
      <main className="container">
        <p className="muted">未找到该主题</p>
        <Link href="/discover">返回发现</Link>
      </main>
    );
  }

  return (
    <main className="container discover-page">
      <div className="section-row" style={{ marginTop: 0 }}>
        <Link href="/search?from=/discover/topic" className="muted">‹ 搜索</Link>
        <span />
      </div>
      <div
        className="card card-tint card-2 card-accent topic-hero"
        style={{ borderLeftColor: topic.color }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>{topic.title}</h1>
        <p className="muted" style={{ marginTop: 6 }}>{topic.subtitle}</p>
        {topic.sensitive && (
          <p className="topic-disclaimer">
            本 App 不能替代牧养咨询；若你正经历严重情绪困扰，请寻求身边可信的牧者或专业帮助。
          </p>
        )}
      </div>

      <div className="section-row" style={{ marginTop: 16 }}>
        <span>精选经文</span>
      </div>
      {topic.verses.map((v) => {
        const href = readerHrefFromRef(v.ref);
        return (
          <div key={v.ref} className="card share-card">
            <button
              type="button"
              className="text-link"
              style={{ padding: 0, fontSize: 13 }}
              onClick={() => setPreview({
                osis: v.ref,
                label: formatGroupRefLabel(v.ref) ?? v.ref,
              })}
            >
              {formatGroupRefLabel(v.ref)}
            </button>
            <p style={{ lineHeight: 1.6 }}>{v.text}</p>
            <div className="share-actions">
              <AssistantLink className="font-pill" refParam={v.ref} excerpt={v.text}>
                问小爱
              </AssistantLink>
              {href && (
                <Link className="font-pill" href={href}>
                  我也在读
                </Link>
              )}
            </div>
          </div>
        );
      })}

      {topic.microPlanId && (
        <div className="card card-2" style={{ marginTop: 14 }}>
          <strong>微{topic.microPlanId.startsWith('prayer_') ? '祷告' : '读经'} · {topic.microPlanDays ?? 7} 天</strong>
          <p className="muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
            围绕「{topic.title}」的短计划，已收录在计划页。
          </p>
          <Link
            className="btn"
            href={`/plans?start=${encodeURIComponent(topic.microPlanId)}`}
            style={{ marginTop: 10, display: 'inline-block' }}
          >
            前往计划页
          </Link>
        </div>
      )}

      {preview && (
        <VersePreviewSheet
          refParam={preview.osis}
          refLabel={preview.label}
          onClose={() => setPreview(null)}
        />
      )}
    </main>
  );
}
