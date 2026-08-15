'use client';

import { useEffect } from 'react';
import { SheetCloseButton } from '@/components/PageBackBar';
import AppBodyPortal from '@/components/AppBodyPortal';
import type { DictEntity } from '@/lib/api';
import {
  entityDisplayName,
  entitySenseLabel,
  entitySummaryText,
  entityTypeLabel,
  hasAlternateSenses,
  type DictContext,
} from '@/lib/dictionary_match';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { refSpaceToOsis } from '@/lib/inline_ref';
import { useSheetOpenGuard } from '@/lib/use_sheet_open_guard';
import { SHEET_OPEN_GUARD_MS } from '@/lib/reader_gesture';
import { unlockReaderSurface } from '@/lib/reader_chrome';

/** 读经点专名：旧版简易词典半屏（标题 / 义项 / 简介 / 参考经文）。 */
export function DictEntrySheet({
  entity,
  candidates,
  ctx,
  onClose,
  onPickEntity,
  onRefPreview,
}: {
  entity: DictEntity;
  candidates: DictEntity[];
  ctx: DictContext;
  onClose: () => void;
  onPickEntity: (entity: DictEntity, remember: boolean) => void;
  onRefPreview: (osis: string, label: string) => void;
}) {
  const { guardedClose } = useSheetOpenGuard(SHEET_OPEN_GUARD_MS);

  useEffect(() => () => {
    unlockReaderSurface();
    window.setTimeout(() => unlockReaderSurface(), 80);
  }, []);

  return (
    <AppBodyPortal onTabAway={onClose}>
      <div
        className="sheet-backdrop"
        data-dismiss-on-tab-nav
        onClick={() => guardedClose(onClose)}
      >
        <div
          className="sheet card dict-entry-sheet"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="section-row" style={{ marginTop: 0 }}>
            <h3 style={{ margin: 0 }}>
              {entityDisplayName(entity)}
              {entityTypeLabel(entity.type) ? (
                <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
                  {entityTypeLabel(entity.type)}
                </span>
              ) : null}
            </h3>
            <SheetCloseButton onClick={onClose} />
          </div>

          {hasAlternateSenses(candidates, ctx) && (
            <div className="dict-sense-row" role="tablist" aria-label="切换义项">
              <span className="muted dict-sense-hint">也可能是：</span>
              {candidates.map((c) => {
                const active = (c.id ?? c.name) === (entity.id ?? entity.name);
                const label = entitySenseLabel(c);
                return (
                  <button
                    key={c.id ?? c.name}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`dict-sense-chip${active ? ' is-active' : ''}`}
                    onClick={() => onPickEntity(c, true)}
                  >
                    {label.length > 14 ? `${label.slice(0, 14)}…` : label}
                  </button>
                );
              })}
            </div>
          )}

          <p style={{ lineHeight: 1.7, marginTop: 8 }}>{entitySummaryText(entity)}</p>

          {entity.refs && entity.refs.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              <p className="muted" style={{ fontSize: 12, marginBottom: 6 }}>参考经文</p>
              <div className="share-actions">
                {entity.refs.slice(0, 8).map((r) => (
                  <button
                    key={r}
                    type="button"
                    className="font-pill"
                    onClick={() => onRefPreview(
                      r.includes('.') ? r : refSpaceToOsis(r),
                      formatGroupRefLabel(r) ?? r,
                    )}
                  >
                    {formatGroupRefLabel(r) ?? r}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </AppBodyPortal>
  );
}
