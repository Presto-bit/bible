import type { Metadata } from 'next';
import { BRAND_FULL, BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
import { analysisShareSiteOrigin } from '@/lib/analysis_share';
import { shareOgImageUrl } from '@/lib/share_og';
import { withShareInstallHint } from '@/lib/share_site';
import { SharePwaGuide } from '@/components/SharePwaGuide';
import { WrappedShareClient } from './share_client';

type Search = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] || '';
  return v || '';
}

function parseMetricPairs(stats: string): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const rules: [RegExp, string][] = [
    [/活跃\s*(\d+)\s*天/u, '活跃天'],
    [/阅读\s*(\d+)\s*分钟/u, '分钟'],
    [/连续\s*(\d+)\s*天/u, '连续天'],
    [/(\d+)\s*章/u, '章'],
    [/笔记\s*(\d+)/u, '笔记'],
    [/划线\s*(\d+)/u, '划线'],
  ];
  for (const [re, label] of rules) {
    const m = stats.match(re);
    if (m) out.push({ value: m[1], label });
    if (out.length >= 4) break;
  }
  return out;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Search>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const label = first(sp.label).trim() || '读经回顾';
  const verseLabel = first(sp.vl).trim();
  const verseText = first(sp.vt).trim();
  const highlight =
    first(sp.h).trim() ||
    verseLabel ||
    `我在${BRAND_NAME}的读经足迹`;
  const stats = first(sp.s).trim();
  const description = withShareInstallHint(
    [verseText || highlight, stats].filter(Boolean).join(' · ').slice(0, 90) || BRAND_TAGLINE,
  );
  const origin = analysisShareSiteOrigin();
  const og = shareOgImageUrl(18);

  return {
    title: `${label}｜${BRAND_NAME}`,
    description,
    metadataBase: new URL(origin),
    openGraph: {
      type: 'website',
      locale: 'zh_CN',
      siteName: BRAND_FULL,
      title: `${label} · ${highlight}`.slice(0, 40),
      description,
      images: [{ url: og.url, width: og.width, height: og.height, alt: BRAND_NAME }],
    },
    twitter: {
      card: 'summary_large_image',
      title: label,
      description,
      images: [og.url],
    },
  };
}

export default async function WrappedSharePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const period = first(sp.period) === 'year' ? 'year' : 'month';
  const label = first(sp.label).trim() || (period === 'year' ? '今年读经' : '本月读经');
  const verseText = first(sp.vt).trim();
  const verseLabel = first(sp.vl).trim();
  const bookName = first(sp.b).trim();
  const daypart = first(sp.dp).trim();
  const highlight = first(sp.h).trim() || `我在${BRAND_NAME}留下了足迹`;
  const stats = first(sp.s).trim();
  const metrics = parseMetricPairs(stats);

  return (
    <main className="container share-landing-page share-landing-wrapped">
      <SharePwaGuide variant="wrapped" />
      <p className="eyebrow">{BRAND_NAME} · 读经回顾</p>
      <p className="muted share-landing-kicker">{label}</p>

      {verseText ? (
        <blockquote className="share-landing-verse">
          <p className="share-landing-verse-text">「{verseText}」</p>
          {verseLabel ? <cite className="share-landing-cite">{verseLabel}</cite> : null}
        </blockquote>
      ) : (
        <h1 className="share-landing-title">{highlight}</h1>
      )}

      {verseText && highlight ? (
        <p className="share-landing-lead">{highlight}</p>
      ) : null}

      {metrics.length > 0 ? (
        <div className="share-landing-metrics">
          {metrics.map((m) => (
            <div key={`${m.label}-${m.value}`} className="share-landing-metric">
              <strong>{m.value}</strong>
              <span>{m.label}</span>
            </div>
          ))}
        </div>
      ) : stats ? (
        <p className="share-landing-lead">{stats}</p>
      ) : null}

      {(bookName || daypart) && (
        <div className="share-landing-chips">
          {bookName ? (
            <span className="share-landing-chip">常读《{bookName}》</span>
          ) : null}
          {daypart ? (
            <span className="share-landing-chip">偏爱{daypart}</span>
          ) : null}
        </div>
      )}

      <p className="muted share-landing-support">{BRAND_TAGLINE}</p>
      <WrappedShareClient period={period} />
    </main>
  );
}
