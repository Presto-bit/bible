'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { topicById } from '@/lib/discover_topics';
import { AssistantLink } from '@/components/AssistantLink';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { formatGroupRefLabel } from '@/lib/ref_label';

export default function TopicPage() {
  const params = useParams();
  const topic = topicById(String(params.id || ''));

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
        <Link href="/discover" className="muted">‹ 发现</Link>
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
            <p className="muted">{formatGroupRefLabel(v.ref)}</p>
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
          <strong>微计划 · {topic.microPlanDays ?? 7} 天</strong>
          <p className="muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
            围绕「{topic.title}」主题，用短计划把经文读进生活。
          </p>
          <Link
            className="btn"
            href={`/plans?start=${encodeURIComponent(topic.microPlanId)}`}
            style={{ marginTop: 10, display: 'inline-block' }}
          >
            开始微计划
          </Link>
        </div>
      )}
    </main>
  );
}
