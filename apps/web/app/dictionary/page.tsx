'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, type DictEntity } from '@/lib/api';
import { entityDisplayName } from '@/lib/dictionary_match';

export default function DictionaryPage() {
  const [term, setTerm] = useState('');
  const [entities, setEntities] = useState<DictEntity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .dictionary()
      .then((d) => setEntities(d.entities || []))
      .catch(() => setEntities([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return entities.slice(0, 80);
    return entities.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.disambiguation ?? '').toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q),
    );
  }, [entities, term]);

  return (
    <main className="container">
      <div className="section-row" style={{ marginTop: 0 }}>
        <Link href="/reader" className="muted">‹ 圣经</Link>
        <strong>圣经词典</strong>
        <span />
      </div>
      <div className="search-bar" style={{ marginTop: 12 }}>
        <input
          className="search-input"
          placeholder="搜索专名、地名…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>
      {loading ? (
        <p className="muted" style={{ marginTop: 16 }}>加载中…</p>
      ) : filtered.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>未找到匹配词条</p>
      ) : (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((e) => (
            <div key={e.id ?? e.name} className="card card-2" style={{ padding: 12 }}>
              <strong>{entityDisplayName(e)}</strong>
              {e.type ? (
                <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                  {e.type}
                </span>
              ) : null}
              <p className="muted" style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.6 }}>
                {e.summary}
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
