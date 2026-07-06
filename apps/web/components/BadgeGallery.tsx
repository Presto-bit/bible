'use client';

import { SheetCloseButton } from '@/components/PageBackBar';
import type { BadgeDef } from '@/lib/badges';

export default function BadgeGallery({
  badges,
  onClose,
}: {
  badges: BadgeDef[];
  onClose: () => void;
}) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card badge-gallery" onClick={(e) => e.stopPropagation()}>
        <div className="section-row" style={{ marginTop: 0 }}>
          <h3 style={{ margin: 0 }}>成就徽章</h3>
          <SheetCloseButton onClick={onClose} />
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
          已收集 {badges.filter((b) => b.done).length} / {badges.length}
        </p>
        <div className="badge-gallery-grid">
          {badges.map((b) => (
            <div key={b.id} className={`badge-gallery-item ${b.done ? 'badge-gallery-done' : ''}`}>
              <div className={`badge-circle ${b.done ? 'badge-done' : ''}`}>
                {b.icon}
              </div>
              <strong>{b.label}</strong>
              <span className="muted">{b.desc}</span>
              {!b.done && <span className="muted" style={{ fontSize: 10 }}>{b.progress}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
