'use client';

import { useState, type DragEvent, type ReactNode } from 'react';
import type { OpsCampaignLanding } from '@/lib/api';
import {
  BLOCK_CATALOG,
  addLandingBlock,
  availableBlockTypes,
  removeLandingBlock,
  reorderLandingBlocks,
  type OpsBlockType,
  type OpsLandingBlock,
} from '@/lib/campaign_blocks';
import { resolvePrimaryCta } from '@/lib/campaign_nav';
import { parseDaysFromBulkText } from '@/lib/campaign_ops';

function toLocalInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** 落地页积木：从控件库添加，拖动排序，展开配置 */
export function CampaignBlockEditor({
  landing,
  setLanding,
  templateId,
  campaignId,
  onHint,
  onError,
}: {
  landing: OpsCampaignLanding;
  setLanding: (next: OpsCampaignLanding) => void;
  templateId: string;
  campaignId: string;
  onHint?: (msg: string) => void;
  onError?: (msg: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(landing.blocks?.[0]?.id || null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const blocks = (landing.blocks || []) as OpsLandingBlock[];
  const available = availableBlockTypes(landing);

  const patch = (next: OpsCampaignLanding) => setLanding(next);

  const updateDay = (
    idx: number,
    dayPatch: Partial<NonNullable<OpsCampaignLanding['days']>[number]>,
  ) => {
    const days = [...(landing.days || [])];
    days[idx] = { ...days[idx], ...dayPatch, day: days[idx]?.day || idx + 1 };
    patch({ ...landing, days });
  };

  const addDay = () => {
    const days = [...(landing.days || [])];
    const next = (days[days.length - 1]?.day || days.length) + 1;
    days.push({ day: next, title: `第 ${next} 天`, body: '', verseRef: '', discussionHint: '' });
    patch({ ...landing, days });
  };

  const applyBulk = () => {
    const days = parseDaysFromBulkText(bulkText);
    if (!days.length) {
      onError?.('没有解析到日课内容');
      return;
    }
    patch({ ...landing, days });
    setBulkOpen(false);
    onHint?.(`已导入 ${days.length} 天`);
  };

  const onAdd = (type: OpsBlockType) => {
    const next = addLandingBlock(landing, type);
    patch(next);
    const added = (next.blocks || []).find((b) => b.type === type);
    if (added) setOpenId(added.id);
  };

  return (
    <div className="ops-blocks">
      <div className="ops-block-palette">
        <p className="ops-subblock-title" style={{ margin: 0 }}>
          控件库
        </p>
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
          点击加入落地页，拖动手柄可调整顺序；展开卡片配置内容。
        </p>
        {available.length === 0 ? (
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            可用控件已全部加入页面。
          </p>
        ) : (
          <div className="ops-block-palette-grid">
            {available.map((type) => {
              const meta = BLOCK_CATALOG[type];
              return (
                <button
                  key={type}
                  type="button"
                  className="ops-block-chip"
                  onClick={() => onAdd(type)}
                >
                  <span className="ops-block-chip-icon" aria-hidden>
                    {meta.icon}
                  </span>
                  <span className="ops-block-chip-text">
                    <strong>{meta.label}</strong>
                    <span className="muted">{meta.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="ops-block-list">
        {blocks.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            尚未添加控件。从上方控件库点选加入。
          </p>
        ) : null}
        {blocks.map((block) => (
          <BlockCard
            key={block.id}
            block={block}
            open={openId === block.id}
            dragging={dragId === block.id}
            dragOver={overId === block.id && dragId !== block.id}
            onToggle={() => setOpenId((id) => (id === block.id ? null : block.id))}
            onRemove={() => {
              patch(removeLandingBlock(landing, block.id));
              if (openId === block.id) setOpenId(null);
            }}
            onDragStart={() => setDragId(block.id)}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOverId(block.id);
            }}
            onDrop={() => {
              if (dragId) patch(reorderLandingBlocks(landing, dragId, block.id));
              setDragId(null);
              setOverId(null);
            }}
          >
            {block.type === 'days' ? (
              <DaysConfig
                landing={landing}
                bulkOpen={bulkOpen}
                bulkText={bulkText}
                setBulkOpen={setBulkOpen}
                setBulkText={setBulkText}
                onAddDay={addDay}
                onApplyBulk={applyBulk}
                onUpdateDay={updateDay}
                onLanding={patch}
              />
            ) : null}
            {block.type === 'schedule' ? (
              <ScheduleConfig landing={landing} onLanding={patch} />
            ) : null}
            {block.type === 'slots' ? <SlotsConfig landing={landing} onLanding={patch} /> : null}
            {block.type === 'entries' ? <EntriesConfig landing={landing} onLanding={patch} /> : null}
            {block.type === 'engage' ? <EngageConfig landing={landing} onLanding={patch} /> : null}
            {block.type === 'cta' ? (
              <CtaConfig templateId={templateId} campaignId={campaignId} landing={landing} />
            ) : null}
          </BlockCard>
        ))}
      </div>
    </div>
  );
}

function BlockCard({
  block,
  open,
  dragging,
  dragOver,
  onToggle,
  onRemove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  children,
}: {
  block: OpsLandingBlock;
  open: boolean;
  dragging: boolean;
  dragOver: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: () => void;
  children: ReactNode;
}) {
  const meta = BLOCK_CATALOG[block.type];
  return (
    <div
      className={`ops-block-card${open ? ' is-open' : ''}${dragging ? ' is-dragging' : ''}${
        dragOver ? ' is-over' : ''
      }`}
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      <div className="ops-block-card-head">
        <button
          type="button"
          className="ops-block-handle"
          draggable
          title="拖动排序"
          aria-label={`拖动排序：${meta.label}`}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', block.id);
            onDragStart();
          }}
          onDragEnd={onDragEnd}
        >
          ⋮⋮
        </button>
        <button type="button" className="ops-block-card-toggle" onClick={onToggle}>
          <span className="ops-block-chip-icon" aria-hidden>
            {meta.icon}
          </span>
          <span className="ops-block-card-titles">
            <strong>{meta.label}</strong>
            <span className="muted">{meta.blurb}</span>
          </span>
          <span className="muted">{open ? '收起' : '配置'}</span>
        </button>
        {block.type !== 'cta' ? (
          <button type="button" className="btn ops-block-remove" onClick={onRemove}>
            移除
          </button>
        ) : null}
      </div>
      {open ? <div className="ops-block-card-body">{children}</div> : null}
    </div>
  );
}

function DaysConfig({
  landing,
  bulkOpen,
  bulkText,
  setBulkOpen,
  setBulkText,
  onAddDay,
  onApplyBulk,
  onUpdateDay,
  onLanding,
}: {
  landing: OpsCampaignLanding;
  bulkOpen: boolean;
  bulkText: string;
  setBulkOpen: (v: boolean) => void;
  setBulkText: (v: string) => void;
  onAddDay: () => void;
  onApplyBulk: () => void;
  onUpdateDay: (
    idx: number,
    patch: Partial<NonNullable<OpsCampaignLanding['days']>[number]>,
  ) => void;
  onLanding: (l: OpsCampaignLanding) => void;
}) {
  const dayUnlock = landing.features?.dayUnlock || 'all';
  return (
    <div className="ops-subblock" style={{ margin: 0, paddingTop: 0, borderTop: 0 }}>
      <p className="ops-subblock-title">日课解锁</p>
      <label className="ops-check-row">
        <input
          type="radio"
          checked={dayUnlock === 'all'}
          onChange={() =>
            onLanding({
              ...landing,
              features: { ...(landing.features || {}), dayUnlock: 'all' },
            })
          }
        />
        全部可读
      </label>
      <label className="ops-check-row">
        <input
          type="radio"
          checked={dayUnlock === 'by_start'}
          onChange={() =>
            onLanding({
              ...landing,
              features: { ...(landing.features || {}), dayUnlock: 'by_start' },
            })
          }
        />
        按开始日每天解锁一天
      </label>

      <div className="ops-subblock-head" style={{ marginTop: 12 }}>
        <p className="ops-subblock-title" style={{ margin: 0 }}>
          日课内容
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn" onClick={() => setBulkOpen(!bulkOpen)}>
            批量粘贴
          </button>
          <button type="button" className="btn" onClick={onAddDay}>
            加一天
          </button>
        </div>
      </div>
      {bulkOpen ? (
        <div className="ops-nested-card" style={{ marginTop: 8 }}>
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
            每天一段，空行分隔；首行可作标题
          </p>
          <textarea
            className="input"
            rows={8}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />
          <button type="button" className="btn btn-primary" style={{ marginTop: 8 }} onClick={onApplyBulk}>
            导入并替换
          </button>
        </div>
      ) : null}
      <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
        {(landing.days || []).map((d, idx) => (
          <div key={d.day || idx} className="ops-nested-card">
            <strong>第 {d.day || idx + 1} 天</strong>
            <label className="ops-field" style={{ marginTop: 8 }}>
              <span>标题</span>
              <input
                className="input"
                value={d.title || ''}
                onChange={(e) => onUpdateDay(idx, { title: e.target.value })}
                placeholder="标题"
              />
            </label>
            <label className="ops-field" style={{ marginTop: 8 }}>
              <span>正文</span>
              <textarea
                className="input"
                rows={4}
                value={d.body || ''}
                onChange={(e) => onUpdateDay(idx, { body: e.target.value })}
                placeholder="正文"
              />
            </label>
            <label className="ops-field" style={{ marginTop: 8 }}>
              <span>经文引用</span>
              <input
                className="input"
                value={d.verseRef || ''}
                onChange={(e) => onUpdateDay(idx, { verseRef: e.target.value })}
                placeholder="如 创 1:1-5"
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScheduleConfig({
  landing,
  onLanding,
}: {
  landing: OpsCampaignLanding;
  onLanding: (l: OpsCampaignLanding) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label className="ops-field">
        <span>开始时间</span>
        <input
          className="input"
          type="datetime-local"
          value={toLocalInput(landing.schedule?.startsAt || '')}
          onChange={(e) =>
            onLanding({
              ...landing,
              schedule: {
                ...(landing.schedule || {}),
                startsAt: e.target.value ? fromLocalInput(e.target.value) : '',
              },
              features: { ...(landing.features || {}), countdown: true },
            })
          }
        />
      </label>
      <label className="ops-field">
        <span>地点</span>
        <input
          className="input"
          placeholder="线下地点"
          value={landing.schedule?.location || ''}
          onChange={(e) =>
            onLanding({
              ...landing,
              schedule: { ...(landing.schedule || {}), location: e.target.value },
              features: { ...(landing.features || {}), countdown: true },
            })
          }
        />
      </label>
      <label className="ops-field">
        <span>线上说明</span>
        <input
          className="input"
          placeholder="会议链接或线上说明"
          value={landing.schedule?.onlineNote || ''}
          onChange={(e) =>
            onLanding({
              ...landing,
              schedule: { ...(landing.schedule || {}), onlineNote: e.target.value },
            })
          }
        />
      </label>
      <label className="ops-check-row">
        <input
          type="checkbox"
          checked={Boolean(landing.features?.rsvp)}
          onChange={(e) =>
            onLanding({
              ...landing,
              features: { ...(landing.features || {}), rsvp: e.target.checked },
            })
          }
        />
        同时收集出席（RSVP）
      </label>
    </div>
  );
}

function SlotsConfig({
  landing,
  onLanding,
}: {
  landing: OpsCampaignLanding;
  onLanding: (l: OpsCampaignLanding) => void;
}) {
  return (
    <div>
      <div className="ops-subblock-head">
        <p className="ops-subblock-title" style={{ margin: 0 }}>
          岗位名额
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const slots = [...(landing.slots || [])];
            const n = slots.length + 1;
            slots.push({
              id: `slot_${n}_${Date.now().toString(36)}`,
              title: `岗位 ${n}`,
              limit: 5,
            });
            onLanding({
              ...landing,
              slots,
              features: { ...(landing.features || {}), signup: true, questions: true },
            });
          }}
        >
          加岗位
        </button>
      </div>
      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
        {(landing.slots || []).map((s, idx) => (
          <div key={s.id} className="ops-nested-card ops-slot-row">
            <input
              className="input"
              value={s.title}
              onChange={(e) => {
                const slots = [...(landing.slots || [])];
                slots[idx] = { ...slots[idx], title: e.target.value };
                onLanding({ ...landing, slots });
              }}
              placeholder="岗位名称"
            />
            <input
              className="input"
              type="number"
              min={1}
              value={s.limit}
              onChange={(e) => {
                const slots = [...(landing.slots || [])];
                slots[idx] = {
                  ...slots[idx],
                  limit: Math.max(1, Number(e.target.value) || 1),
                };
                onLanding({ ...landing, slots });
              }}
              aria-label="名额"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function EntriesConfig({
  landing,
  onLanding,
}: {
  landing: OpsCampaignLanding;
  onLanding: (l: OpsCampaignLanding) => void;
}) {
  return (
    <div>
      <div className="ops-subblock-head">
        <p className="ops-subblock-title" style={{ margin: 0 }}>
          多入口
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const entries = [...(landing.entries || [])];
            const n = entries.length + 1;
            entries.push({
              id: `e${n}_${Date.now().toString(36)}`,
              title: `入口 ${n}`,
              sub: '',
              href: '/reader',
            });
            onLanding({ ...landing, entries });
          }}
        >
          加入口
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '6px 0 8px' }}>
        至少 2 个有效入口（标题 + 链接）才能发布
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        {(landing.entries || []).map((e, idx) => (
          <div key={e.id || idx} className="ops-nested-card">
            <label className="ops-field">
              <span>标题</span>
              <input
                className="input"
                placeholder="标题"
                value={e.title}
                onChange={(ev) => {
                  const entries = [...(landing.entries || [])];
                  entries[idx] = { ...entries[idx], title: ev.target.value };
                  onLanding({ ...landing, entries });
                }}
              />
            </label>
            <label className="ops-field" style={{ marginTop: 8 }}>
              <span>副文案</span>
              <input
                className="input"
                placeholder="可选"
                value={e.sub || ''}
                onChange={(ev) => {
                  const entries = [...(landing.entries || [])];
                  entries[idx] = { ...entries[idx], sub: ev.target.value };
                  onLanding({ ...landing, entries });
                }}
              />
            </label>
            <label className="ops-field" style={{ marginTop: 8 }}>
              <span>链接</span>
              <input
                className="input"
                placeholder="/reader"
                value={e.href}
                onChange={(ev) => {
                  const entries = [...(landing.entries || [])];
                  entries[idx] = { ...entries[idx], href: ev.target.value };
                  onLanding({ ...landing, entries });
                }}
              />
            </label>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 8 }}
              onClick={() => {
                const entries = (landing.entries || []).filter((_, i) => i !== idx);
                onLanding({ ...landing, entries });
              }}
            >
              删除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function EngageConfig({
  landing,
  onLanding,
}: {
  landing: OpsCampaignLanding;
  onLanding: (l: OpsCampaignLanding) => void;
}) {
  const f = landing.features || {};
  const toggle = (key: keyof NonNullable<OpsCampaignLanding['features']>, checked: boolean) => {
    onLanding({
      ...landing,
      features: { ...f, [key]: checked },
    });
  };
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {(
        [
          ['likes', '点赞'],
          ['comments', '评论'],
          ['rsvp', 'RSVP 出席'],
          ['prayer', '代祷意向'],
          ['questions', '提问箱'],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="ops-check-row">
          <input
            type="checkbox"
            checked={Boolean(f[key])}
            onChange={(e) => toggle(key, e.target.checked)}
          />
          {label}
        </label>
      ))}
      {f.prayer ? (
        <label className="ops-check-row">
          <input
            type="checkbox"
            checked={Boolean(f.prayerPrivate)}
            onChange={(e) => toggle('prayerPrivate', e.target.checked)}
          />
          代祷仅管理可见
        </label>
      ) : null}
    </div>
  );
}

function CtaConfig({
  templateId,
  campaignId,
  landing,
}: {
  templateId: string;
  campaignId: string;
  landing: OpsCampaignLanding;
}) {
  const cta = resolvePrimaryCta(templateId, campaignId, landing.primaryCta);
  return (
    <div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        按模板自动设置，成员打开落地页即可行动，无需再填链接。
      </p>
      <div className="ops-auto-cta">
        <strong>{cta.label}</strong>
        <span className="muted">{cta.href}</span>
      </div>
    </div>
  );
}
