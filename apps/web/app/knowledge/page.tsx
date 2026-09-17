import { KnowledgeTopicsClient } from '@/components/knowledge/KnowledgeTopicsClient';
import type { KnowledgeLayoutSummary } from '@/lib/api';

export const revalidate = 60;

async function loadLayouts(): Promise<KnowledgeLayoutSummary[]> {
  const base = (process.env.NEXT_PUBLIC_API_BASE || 'https://2sc.prestoai.cn').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/content/knowledge-layouts`, {
      next: { revalidate: 60 },
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { layouts?: KnowledgeLayoutSummary[] };
    return Array.isArray(data.layouts) ? data.layouts : [];
  } catch {
    return [];
  }
}

function sortLayouts(rows: KnowledgeLayoutSummary[]) {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.generated_at || '') || 0;
    const tb = Date.parse(b.generated_at || '') || 0;
    if (tb !== ta) return tb - ta;
    return (a.title || a.id || '').localeCompare(b.title || b.id || '', 'zh');
  });
}

/** 圣经知识专题列表：服务端预取，避免客户端空窗 */
export default async function KnowledgeTopicsPage() {
  const layouts = sortLayouts(await loadLayouts());
  return <KnowledgeTopicsClient initialLayouts={layouts} />;
}
