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

function normalizeRef(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return s;
  return s.includes('.') ? s : refSpaceToOsis(s.replace(/\./g, ' '));
}

export default function TopicPage() {
  const params = useParams();
  const id = decodeURIComponent(String(params.id || ''));
  const staticTopic = topicById(id);
  const [verses, setVerses] = useState<VerseCard[]>(staticTopic?.verses ?? []);
  const [title, setTitle] = useState(staticTopic?.title ?? id);
  const [subtitle, setSubtitle] = useState(
    staticTopic?.subtitle ?? '精选经文',
  );
  const [color, setColor] = useState(staticTopic?.color ?? topicColor(0));
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ osis: string; label: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const staticHit = topicById(id);
    if (staticHit) {
      setTitle(staticHit.title);
      setSubtitle(staticHit.subtitle);
      setColor(staticHit.color);
      setVerses(staticHit.verses);
    }

    // 人生主题用英文 id，经文主题用中文名；两者都尝试拉 API 扩充经文
    const apiKey = staticHit?.title || id;
    void api
      .topics(apiKey)
      .then((d) => {
        if (cancelled || !d || typeof d !== 'object') return;
        if (!('refs' in d) && !('name' in d)) return;
        const entry = d as { name?: string; refs?: Array<string | { ref: string; text?: string }> };
        if (entry.name) {
          setTitle(entry.name);
          if (!staticHit) {
            setSubtitle(`${(entry.refs ?? []).length || '…'} 节精选经文`);
            setColor(topicColor(entry.name.charCodeAt(0) % 10));
          }
        }
        const apiVerses: VerseCard[] = (entry.refs ?? []).slice(0, 16).map((r) => {
          if (typeof r === 'string') {
            return { ref: normalizeRef(r), text: '（点击预览经文）' };
          }
          return {
            ref: normalizeRef(r.ref),
            text: (r.text || '').trim() || '（点击预览经文）',
          };
        });
        if (apiVerses.length) {
          // 静态人生主题在前，API 经文去重追加
          const seen = new Set((staticHit?.verses ?? []).map((v) => normalizeRef(v.ref)));
          const merged = [...(staticHit?.verses ?? [])];
          for (const v of apiVerses) {
            if (seen.has(v.ref)) continue;
            seen.add(v.ref);
            merged.push(v);
          }
          setVerses(merged);
        }
      })
      .catch(() => {
        // 无 API 数据时保留静态人生主题
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading && verses.length === 0) {
    return (
      <main className="container">
        <p className="muted">加载中…</p>
      </main>
    );
  }

  if (!loading && verses.length === 0) {
    return (
      <main className="container">
        <p className="muted">未找到该主题</p>
        <Link href="/search">返回搜索</Link>
      </main>
    );
  }

  const topic: LifeTopic = {
    id: staticTopic?.id ?? id,
    title,
    subtitle,
    color,
    verses,
    microPlanId: staticTopic?.microPlanId,
    microPlanDays: staticTopic?.microPlanDays,
    sensitive: staticTopic?.sensitive,
  };

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
        <span>精选经文 · {topic.verses.length}</span>
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
                osis: normalizeRef(v.ref),
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
