'use client';

import { useEffect, useState } from 'react';
import {
  BADGE_CATEGORY_LABELS,
  BADGE_CATEGORY_ORDER,
  type BadgeCategory,
  type BadgeDef,
} from '@/lib/badges';
import { SheetCloseButton } from '@/components/PageBackBar';
import AppBodyPortal from '@/components/AppBodyPortal';

export default function BadgeGallery({
  badges,
  onClose,
}: {
  badges: BadgeDef[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<BadgeCategory | 'all'>('all');

  const filtered =
    tab === 'all' ? badges : badges.filter((b) => b.category === tab);

  const earned = badges.filter((b) => b.done).length;

  return (
    <AppBodyPortal>
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet card badge-gallery" onClick={(e) => e.stopPropagation()}>
          <div className="section-row" style={{ marginTop: 0 }}>
            <h3 style={{ margin: 0 }}>成就徽章</h3>
            <SheetCloseButton onClick={onClose} />
          </div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            已收集 {earned} / {badges.length}
          </p>

          <div className="badge-gallery-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              className={`badge-gallery-tab${tab === 'all' ? ' active' : ''}`}
              onClick={() => setTab('all')}
            >
              全部
            </button>
            {BADGE_CATEGORY_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                className={`badge-gallery-tab${tab === c ? ' active' : ''}`}
                onClick={() => setTab(c)}
              >
                {BADGE_CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>

          <div className="badge-gallery-grid">
            {filtered.map((b) => (
              <div key={b.id} className={`badge-gallery-item ${b.done ? 'badge-gallery-done' : ''}`}>
                <div className={`badge-circle ${b.done ? 'badge-done' : ''}`}>
                  {b.icon}
                </div>
                <strong>{b.label}</strong>
                <span className="muted">{b.desc}</span>
                {!b.done && (
                  <>
                    <span className="badge-gallery-hint">{b.hint}</span>
                    <span className="muted badge-gallery-progress">{b.progress}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppBodyPortal>
  );
}
