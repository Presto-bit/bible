'use client';

import Link from 'next/link';
import type { HomeMoreItem } from '@/lib/home_rail';

type Props = {
  open: boolean;
  items: HomeMoreItem[];
  onClose: () => void;
};

export function HomeMoreSheet({ open, items, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card home-more-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row">
          <strong>更多入口</strong>
          <button type="button" className="text-link" onClick={onClose}>
            关闭
          </button>
        </div>
        <ul className="home-more-list">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={item.href} className="home-more-row card-row" onClick={onClose}>
                <span className="home-more-icon" aria-hidden>{item.icon}</span>
                <span className="home-more-main">
                  <span className="home-more-tag">{item.tag}</span>
                  <strong>{item.title}</strong>
                  <span className="muted home-more-sub">{item.sub}</span>
                </span>
                <span className="home-more-chevron muted">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
