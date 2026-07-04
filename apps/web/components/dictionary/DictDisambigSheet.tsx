'use client';

import type { DictEntity } from '@/lib/api';
import { entityDisplayName, entitySummaryText } from '@/lib/dictionary_match';

type Props = {
  name: string;
  candidates: DictEntity[];
  onPick: (entity: DictEntity) => void;
  onClose: () => void;
};

export function DictDisambigSheet({ name, candidates, onPick, onClose }: Props) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card dict-disambig-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>你指的是？</strong>
          <button type="button" className="text-link" onClick={onClose}>取消</button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          「{name}」在本卷中有 {candidates.length} 个不同条目
        </p>
        <ul className="dict-disambig-list">
          {candidates.map((e) => (
            <li key={e.id}>
              <button type="button" className="dict-disambig-row card-row" onClick={() => onPick(e)}>
                <span className="dict-disambig-name">{entityDisplayName(e)}</span>
                <span className="muted dict-disambig-summary">{entitySummaryText(e)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
