'use client';

import { useRef, useState, type DragEvent } from 'react';
import type { OpsCampaignLanding } from '@/lib/api';
import {
  BLOCK_CATALOG,
  OPS_BLOCK_TYPE_MIME,
  isOpsBlockType,
  normalizeBlocks,
  type OpsBlockType,
  type OpsLandingBlock,
} from '@/lib/campaign_blocks';
import { resolvePrimaryCta } from '@/lib/campaign_nav';

type TabItem = { id: string; label: string; body: string };

const DROP_END = '__end__';

function asTabs(data?: Record<string, unknown>): TabItem[] {
  const raw = data?.tabs;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t, i) => {
      if (!t || typeof t !== 'object') return null;
      const r = t as Record<string, unknown>;
      return {
        id: String(r.id || `t${i}`),
        label: String(r.label || `标签 ${i + 1}`),
        body: String(r.body || ''),
      };
    })
    .filter(Boolean) as TabItem[];
}

function readPaletteType(e: DragEvent): OpsBlockType | null {
  const raw =
    e.dataTransfer.getData(OPS_BLOCK_TYPE_MIME) || e.dataTransfer.getData('text/plain');
  if (!raw) return null;
  const type = raw.startsWith('ops-block-type:') ? raw.slice('ops-block-type:'.length) : raw;
  return isOpsBlockType(type) ? type : null;
}

function readReorderId(e: DragEvent): string | null {
  const typed = e.dataTransfer.getData('application/x-ops-block-id');
  if (typed) return typed;
  if (e.dataTransfer.types.includes(OPS_BLOCK_TYPE_MIME)) return null;
  const raw = e.dataTransfer.getData('text/plain');
  if (!raw || raw.startsWith('ops-block-type:') || isOpsBlockType(raw)) return null;
  return raw;
}

/** 按积木顺序渲染落地页内容（预览 / 正式页共用） */
export function CampaignLandingBlocks({
  landing,
  templateId,
  campaignId,
  mode = 'view',
  tag,
  /** 仅渲染这些类型；默认全部 */
  onlyTypes,
  /** 预览态点击主按钮（如切到「今日阅读」预览） */
  onCtaClick,
  /** 预览态点击区块 → 回跳编辑该控件 */
  onEditBlock,
  /** 从调色板拖入：插到 beforeId 前；无则追加末尾 */
  onInsertBlock,
  /** 预览内已有块拖拽排序 */
  onReorderBlocks,
}: {
  landing: OpsCampaignLanding;
  templateId?: string;
  campaignId?: string;
  mode?: 'view' | 'preview';
  tag?: string;
  onlyTypes?: OpsLandingBlock['type'][];
  onCtaClick?: () => void;
  onEditBlock?: (blockId: string) => void;
  onInsertBlock?: (type: OpsBlockType, beforeId?: string) => void;
  onReorderBlocks?: (fromId: string, toId: string) => void;
}) {
  const blocks = normalizeBlocks(landing.blocks).filter((b) =>
    onlyTypes ? onlyTypes.includes(b.type) : true,
  );
  const cta = resolvePrimaryCta(templateId || '', campaignId, landing.primaryCta);
  const days = landing.days || [];
  const schedule = landing.schedule;
  const slots = (landing.slots || []).filter((s) => (s.title || '').trim());
  const entries = (landing.entries || []).filter(
    (e) => (e.title || '').trim() && (e.href || '').trim(),
  );
  const features = landing.features || {};

  const canDrop = mode === 'preview' && Boolean(onInsertBlock || onReorderBlocks);
  const canReorder = mode === 'preview' && Boolean(onReorderBlocks);
  const [overId, setOverId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const skipClickRef = useRef(false);

  const onDragOverZone = (e: DragEvent, zoneId: string) => {
    if (!canDrop) return;
    // Safari 等在 dragover 阶段不暴露自定义 MIME，只认 text/plain
    const types = Array.from(e.dataTransfer.types || []).map((t) => t.toLowerCase());
    const hasText = types.includes('text/plain') || types.includes('text');
    const fromPalette =
      types.includes(OPS_BLOCK_TYPE_MIME.toLowerCase()) ||
      (hasText && onInsertBlock != null);
    const fromBlock =
      canReorder &&
      (types.includes('application/x-ops-block-id') || hasText);
    if (!fromPalette && !fromBlock) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = types.includes('application/x-ops-block-id') ? 'move' : 'copy';
    setOverId(zoneId);
  };

  const onDropZone = (e: DragEvent, beforeId?: string) => {
    if (!canDrop) return;
    e.preventDefault();
    e.stopPropagation();
    const type = readPaletteType(e);
    if (type && onInsertBlock) {
      onInsertBlock(type, beforeId);
      setOverId(null);
      setDragId(null);
      return;
    }
    const fromId = readReorderId(e) || dragId;
    if (fromId && beforeId && onReorderBlocks && fromId !== beforeId) {
      onReorderBlocks(fromId, beforeId);
    }
    setOverId(null);
    setDragId(null);
  };

  const dropHint =
    canDrop && onInsertBlock ? (
      <div
        className={`ops-lb-drop-end${overId === DROP_END ? ' is-drop-over' : ''}`}
        onDragOver={(e) => onDragOverZone(e, DROP_END)}
        onDragLeave={() => setOverId((id) => (id === DROP_END ? null : id))}
        onDrop={(e) => onDropZone(e, undefined)}
      >
        拖到此处添加控件
      </div>
    ) : null;

  if (!blocks.length) {
    return (
      <div
        className={`ops-landing-blocks${mode === 'preview' ? ' is-preview' : ''}${
          canDrop ? ' is-droppable' : ''
        }`}
        onDragOver={canDrop ? (e) => onDragOverZone(e, DROP_END) : undefined}
        onDrop={canDrop ? (e) => onDropZone(e, undefined) : undefined}
      >
        {landing.body ? <p className="ops-view-body">{landing.body}</p> : null}
        {dropHint ||
          (mode === 'preview' && onInsertBlock ? (
            <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
              从左侧拖入控件开始搭建
            </p>
          ) : null)}
      </div>
    );
  }

  return (
    <div
      className={`ops-landing-blocks${mode === 'preview' ? ' is-preview' : ''}${
        canDrop ? ' is-droppable' : ''
      }`}
    >
      {mode === 'preview' && tag ? <span className="pill">{tag}</span> : null}
      {blocks.map((block) => {
        const editable = mode === 'preview' && Boolean(onEditBlock);
        const clickable = editable && block.type !== 'cta' && block.type !== 'divider';
        const inner = (
          <BlockView
            block={block}
            landing={landing}
            days={days}
            schedule={schedule}
            slots={slots}
            entries={entries}
            features={features}
            ctaLabel={cta.label}
            mode={mode}
            onCtaClick={
              block.type === 'cta' && editable
                ? () => onEditBlock?.(block.id)
                : onCtaClick
            }
          />
        );
        return (
          <div
            key={block.id}
            className={[
              'ops-lb-wrap',
              clickable ? 'is-editable' : '',
              canDrop && overId === block.id ? 'is-drop-over' : '',
              dragId === block.id ? 'is-dragging' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            draggable={canReorder}
            title={
              canReorder
                ? '拖拽排序；点击编辑'
                : clickable
                  ? '点击编辑此控件'
                  : undefined
            }
            onDragStart={
              canReorder
                ? (e) => {
                    e.dataTransfer.setData('application/x-ops-block-id', block.id);
                    e.dataTransfer.setData('text/plain', block.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDragId(block.id);
                    skipClickRef.current = false;
                  }
                : undefined
            }
            onDrag={() => {
              skipClickRef.current = true;
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
              window.setTimeout(() => {
                skipClickRef.current = false;
              }, 0);
            }}
            onDragOver={(e) => onDragOverZone(e, block.id)}
            onDragLeave={() => setOverId((id) => (id === block.id ? null : id))}
            onDrop={(e) => onDropZone(e, block.id)}
            onClick={
              clickable
                ? () => {
                    if (skipClickRef.current) return;
                    onEditBlock?.(block.id);
                  }
                : undefined
            }
            onKeyDown={
              clickable
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onEditBlock?.(block.id);
                    }
                  }
                : undefined
            }
          >
            {canReorder ? (
              <span className="ops-lb-drag-hint muted" aria-hidden>
                ⋮⋮
              </span>
            ) : null}
            {mode === 'preview' ? (
              <span className="ops-lb-type-tag">{BLOCK_CATALOG[block.type].label}</span>
            ) : null}
            {inner}
          </div>
        );
      })}
      {dropHint}
    </div>
  );
}

function BlockView({
  block,
  days,
  schedule,
  slots,
  entries,
  features,
  ctaLabel,
  mode,
  onCtaClick,
}: {
  block: OpsLandingBlock;
  landing: OpsCampaignLanding;
  days: NonNullable<OpsCampaignLanding['days']>;
  schedule: OpsCampaignLanding['schedule'];
  slots: NonNullable<OpsCampaignLanding['slots']>;
  entries: NonNullable<OpsCampaignLanding['entries']>;
  features: NonNullable<OpsCampaignLanding['features']>;
  ctaLabel: string;
  mode: 'view' | 'preview';
  onCtaClick?: () => void;
}) {
  const d = block.data || {};

  if (block.type === 'text') {
    const heading = String(d.heading || '').trim();
    const body = String(d.body || '').trim();
    if (!heading && !body) {
      return mode === 'preview' ? (
        <p className="muted" style={{ fontSize: 13 }}>
          文本控件（待填写）
        </p>
      ) : null;
    }
    return (
      <div className="ops-lb-text">
        {heading ? <h3 className="ops-lb-heading">{heading}</h3> : null}
        {body ? <p className="ops-lb-body">{body}</p> : null}
      </div>
    );
  }

  if (block.type === 'audio') {
    const src = String(d.src || '').trim();
    const title = String(d.title || '').trim();
    const caption = String(d.caption || '').trim();
    if (!src && mode === 'view') return null;
    return (
      <div className="ops-lb-audio card">
        {title ? <strong>{title}</strong> : <strong>{BLOCK_CATALOG.audio.label}</strong>}
        {src ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio controls src={src} preload="none" style={{ width: '100%', marginTop: 8 }} />
        ) : (
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
            未设置音频地址
          </p>
        )}
        {caption ? <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>{caption}</p> : null}
      </div>
    );
  }

  if (block.type === 'image') {
    const url = String(d.url || '').trim();
    const caption = String(d.caption || '').trim();
    if (!url && mode === 'view') return null;
    return (
      <figure className="ops-lb-image">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={caption || '活动图片'} />
        ) : (
          <div className="ops-lb-image-ph muted">图片控件（待填 URL）</div>
        )}
        {caption ? <figcaption className="muted">{caption}</figcaption> : null}
      </figure>
    );
  }

  if (block.type === 'divider') {
    return d.style === 'space' ? (
      <div className="ops-lb-space" aria-hidden />
    ) : (
      <hr className="ops-lb-divider" />
    );
  }

  if (block.type === 'verse') {
    const ref = String(d.ref || '').trim();
    const note = String(d.note || '').trim();
    if (!ref && mode === 'view') return null;
    return (
      <blockquote className="ops-lb-verse">
        <strong>{ref || '经文引用'}</strong>
        {note ? <p>{note}</p> : null}
      </blockquote>
    );
  }

  if (block.type === 'tabs') {
    return <TabsBlock data={d} mode={mode} />;
  }

  if (block.type === 'schedule') {
    const has =
      (schedule?.location || '').trim() ||
      (schedule?.startsAt || '').trim() ||
      (schedule?.onlineNote || '').trim();
    if (!has) {
      return mode === 'preview' ? (
        <p className="muted" style={{ fontSize: 13 }}>
          聚会日程（待填写）
        </p>
      ) : null;
    }
    return (
      <div className="ops-preview-block ops-lb-card">
        <strong>{BLOCK_CATALOG.schedule.label}</strong>
        {(schedule?.startsAt || '').trim() ? (
          <span className="muted">{new Date(schedule!.startsAt!).toLocaleString('zh-CN')}</span>
        ) : null}
        {(schedule?.location || '').trim() ? <span>{schedule!.location}</span> : null}
        {(schedule?.onlineNote || '').trim() ? (
          <span className="muted">{schedule!.onlineNote}</span>
        ) : null}
      </div>
    );
  }

  if (block.type === 'days') {
    if (!days.length) {
      return mode === 'preview' ? (
        <p className="muted" style={{ fontSize: 13 }}>
          日课列表（待添加）
        </p>
      ) : null;
    }
    return (
      <div className="ops-preview-block ops-lb-card">
        <strong>
          {BLOCK_CATALOG.days.label} · {days.length} 天
        </strong>
        <ol className="ops-preview-days">
          {days.slice(0, mode === 'preview' ? 5 : 99).map((day, i) => (
            <li key={day.day || i}>
              <span>第 {day.day || i + 1} 天</span>
              <span className="muted">
                {(day.title || '').trim() ||
                  ((day.verseRef || '').trim() ? day.verseRef : '待填写')}
              </span>
            </li>
          ))}
          {mode === 'preview' && days.length > 5 ? (
            <li className="muted">…还有 {days.length - 5} 天</li>
          ) : null}
        </ol>
      </div>
    );
  }

  if (block.type === 'slots') {
    if (!slots.length) {
      return mode === 'preview' ? (
        <p className="muted" style={{ fontSize: 13 }}>
          岗位报名（待添加）
        </p>
      ) : null;
    }
    return (
      <div className="ops-preview-block ops-lb-card">
        <strong>{BLOCK_CATALOG.slots.label}</strong>
        {slots.map((s) => (
          <div key={s.id} className="ops-preview-row">
            <span>{s.title}</span>
            <span className="muted">名额 {s.limit}</span>
          </div>
        ))}
      </div>
    );
  }

  if (block.type === 'entries') {
    if (!entries.length) {
      return mode === 'preview' ? (
        <p className="muted" style={{ fontSize: 13 }}>
          入口卡片（待添加）
        </p>
      ) : null;
    }
    return (
      <div className="ops-preview-block ops-lb-card">
        <strong>{BLOCK_CATALOG.entries.label}</strong>
        {entries.map((e) => (
          <div key={e.id || e.href} className="ops-preview-row">
            <span>{e.title}</span>
            <span className="muted">{e.sub || e.href}</span>
          </div>
        ))}
      </div>
    );
  }

  if (block.type === 'engage') {
    const bits = [
      features.likes ? '点赞' : null,
      features.comments ? '评论' : null,
      features.rsvp ? 'RSVP' : null,
      features.prayer ? '代祷' : null,
      features.questions ? '提问' : null,
    ].filter(Boolean);
    if (!bits.length && mode === 'view') return null;
    return (
      <div className="ops-preview-block ops-lb-card">
        <strong>{BLOCK_CATALOG.engage.label}</strong>
        <span className="muted">{bits.length ? bits.join(' · ') : '未开启互动'}</span>
      </div>
    );
  }

  if (block.type === 'cta') {
    const clickable = mode === 'preview' && Boolean(onCtaClick);
    return (
      <button
        type="button"
        className={`btn btn-primary ops-preview-cta${clickable ? ' is-clickable' : ''}`}
        disabled={mode === 'preview' && !onCtaClick}
        onClick={clickable ? onCtaClick : undefined}
      >
        {ctaLabel}
      </button>
    );
  }

  return null;
}

function TabsBlock({
  data,
  mode,
}: {
  data: Record<string, unknown>;
  mode: 'view' | 'preview';
}) {
  const tabs = asTabs(data);
  const [active, setActive] = useState(tabs[0]?.id || '');
  if (!tabs.length) {
    return mode === 'preview' ? (
      <p className="muted" style={{ fontSize: 13 }}>
        Tab 分组（待配置）
      </p>
    ) : null;
  }
  const cur = tabs.find((t) => t.id === active) || tabs[0];
  return (
    <div className="ops-lb-tabs">
      <div className="ops-lb-tablist" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={cur.id === t.id}
            className={`ops-lb-tab${cur.id === t.id ? ' is-on' : ''}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="ops-lb-tabpanel" role="tabpanel">
        {cur.body.trim() ? (
          <p className="ops-lb-body">{cur.body}</p>
        ) : (
          <p className="muted" style={{ fontSize: 13 }}>
            此标签暂无内容
          </p>
        )}
      </div>
    </div>
  );
}
