'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  api,
  type OpsCampaignLanding,
  type OpsCampaignTemplate,
} from '@/lib/api';
import { buildPublishChecklist } from '@/lib/campaign_ops';

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export default function CampaignNewPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState<OpsCampaignTemplate[]>([]);
  const [userTemplates, setUserTemplates] = useState<
    Array<{ id: string; name: string; baseTemplateId: string; landing: OpsCampaignLanding }>
  >([]);
  const [groups, setGroups] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [templateId, setTemplateId] = useState('multi_day');
  const [fromUserTemplateId, setFromUserTemplateId] = useState<string | null>(null);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [body, setBody] = useState('');
  const [daysText, setDaysText] = useState('第1天\n\n第2天\n\n第3天');
  const [location, setLocation] = useState('');
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [endsAt, setEndsAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return toLocalInput(d);
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [t, g, ut] = await Promise.all([
          api.campaignTemplates(),
          api.campaignStaffGroups(),
          api.listUserCampaignTemplates().catch(() => ({ templates: [] })),
        ]);
        setTemplates(t.templates || []);
        setGroups(g.groups || []);
        setUserTemplates(ut.templates || []);
        if (g.groups?.length === 1) setGroupIds([g.groups[0].id]);
      } catch (e) {
        setErr(e instanceof Error ? e.message : '加载失败');
      }
    })();
  }, []);

  const selected = useMemo(
    () => templates.find((t) => t.id === templateId),
    [templates, templateId],
  );

  const toggleGroup = (id: string) => {
    setGroupIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const publish = async (asDraft: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const seed =
        (fromUserTemplateId
          ? userTemplates.find((u) => u.id === fromUserTemplateId)?.landing
          : null) ||
        selected?.landing ||
        {};
      const landing: OpsCampaignLanding = {
        ...seed,
        title: name.trim(),
        body: body.trim() || seed.body,
        features: seed.features,
      };
      if (templateId === 'multi_day' || templateId === 'verse_day' || templateId === 'memory') {
        const parts = daysText.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
        landing.days = parts.map((block, i) => {
          const lines = block.split('\n');
          return {
            day: i + 1,
            title: lines[0] || `第 ${i + 1} 天`,
            body: lines.slice(1).join('\n').trim() || lines[0] || '',
            verseRef: '',
            discussionHint: '',
          };
        });
        if (!landing.days.length) {
          throw new Error('请至少填写一天日课（用空行分隔每天）');
        }
      }
      if (templateId === 'gathering') {
        landing.schedule = {
          ...(seed.schedule || {}),
          startsAt: fromLocalInput(startsAt),
          location,
        };
      }
      if (!asDraft) {
        const errs = buildPublishChecklist({
          name: name.trim() || selected?.name || '未命名活动',
          templateId,
          groupIds,
          landing,
        });
        if (errs.length) throw new Error(errs.join('；'));
      }
      const { campaign } = await api.createCampaign({
        name: name.trim() || selected?.name || '未命名活动',
        templateId,
        status: asDraft ? 'draft' : 'published',
        startAt: fromLocalInput(startsAt),
        endAt: fromLocalInput(endsAt),
        subtitle: subtitle.trim(),
        railSlot: 1,
        railEnabled: true,
        groupIds,
        landing,
      });
      router.replace(asDraft ? `/campaigns/${campaign.id}/edit` : `/campaigns/view/${campaign.id}?preview=1`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="container ops-page">
      <div className="ops-page-head">
        <div>
          <Link href="/campaigns" className="ops-back">
            ← 活动运营
          </Link>
          <h1 className="ops-page-title">新建活动</h1>
          <p className="ops-page-sub">约 2 分钟完成：选模板 → 谁能看见 → 填内容</p>
        </div>
      </div>

      <div className="ops-steps" aria-label="创建进度">
        {(
          [
            [1, '选模板'],
            [2, '谁能看见'],
            [3, '填内容'],
          ] as const
        ).map(([n, label]) => (
          <div
            key={n}
            className={`ops-step${step === n ? ' is-current' : ''}${step > n ? ' is-done' : ''}`}
          >
            <span className="ops-step-n">STEP {n}</span>
            <span className="ops-step-label">{label}</span>
          </div>
        ))}
      </div>

      {err ? <p className="ops-banner ops-banner-warn" style={{ color: 'var(--danger, #b00)' }}>{err}</p> : null}

      {step === 1 ? (
        <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
          {userTemplates.length > 0 ? (
            <>
              <p className="section-label">我的模板</p>
              {userTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`ops-template${fromUserTemplateId === t.id ? ' is-on' : ''}`}
                  onClick={() => {
                    setFromUserTemplateId(t.id);
                    setTemplateId(t.baseTemplateId);
                    setName(t.name);
                    setBody(t.landing?.body || '');
                  }}
                >
                  <span className="pill">我的</span>
                  <strong>{t.name}</strong>
                </button>
              ))}
            </>
          ) : null}
          <p className="section-label">平台模板</p>
          {Array.from(
            templates.reduce((map, t) => {
              const key = t.domainLabel || t.domain || '其他';
              const list = map.get(key) || [];
              list.push(t);
              map.set(key, list);
              return map;
            }, new Map<string, OpsCampaignTemplate[]>()),
          ).map(([domain, list]) => (
            <div key={domain} style={{ display: 'grid', gap: 8 }}>
              <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>{domain}</p>
              {list.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`ops-template${!fromUserTemplateId && templateId === t.id ? ' is-on' : ''}`}
                  onClick={() => {
                    setFromUserTemplateId(null);
                    setTemplateId(t.id);
                    if (!name.trim()) setName(t.name);
                    if (!body.trim() && t.landing?.body) setBody(String(t.landing.body));
                  }}
                >
                  <span className="pill">{t.tag}</span>
                  <strong>{t.name}</strong>
                  <span className="muted">{t.blurb}</span>
                </button>
              ))}
            </div>
          ))}
          <div className="ops-sticky-bar">
            <button type="button" className="btn btn-primary" onClick={() => setStep(2)} disabled={!templateId}>
              下一步：谁能看见
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div style={{ marginTop: 16 }}>
          <p className="section-label">谁能看见</p>
          {groups.length === 0 ? (
            <div className="card ops-empty">
              <p>你还不是任何群的群主或管理员</p>
              <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>
                请先在发现里创建或管理一个共读群，再回来发布活动。
              </p>
              <Link href="/discover" className="btn">
                去发现
              </Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setGroupIds(groups.map((g) => g.id))}
                >
                  全选
                </button>
                <button type="button" className="btn" onClick={() => setGroupIds([])}>
                  清空
                </button>
              </div>
              {groups.map((g) => (
                <label
                  key={g.id}
                  className={`ops-template${groupIds.includes(g.id) ? ' is-on' : ''}`}
                  style={{ display: 'flex', gap: 10, alignItems: 'center' }}
                >
                  <input
                    type="checkbox"
                    checked={groupIds.includes(g.id)}
                    onChange={() => toggleGroup(g.id)}
                  />
                  <span>
                    <strong style={{ marginTop: 0 }}>{g.name}</strong>
                    <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                      {g.role === 'owner' ? '群主' : '管理员'}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="ops-sticky-bar">
            <button type="button" className="btn" onClick={() => setStep(1)}>
              上一步
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!groupIds.length}
              onClick={() => setStep(3)}
            >
              下一步：填写内容
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          {selected ? (
            <p className="ops-banner ops-banner-info" style={{ marginTop: 0 }}>
              模板：{selected.name} · 发布后可在编辑页继续完善
            </p>
          ) : null}
          <label className="ops-field">
            <span>活动名称</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={selected?.name || '活动名称'}
            />
          </label>
          <label className="ops-field">
            <span>首页副文案（一句）</span>
            <input
              className="input"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="出现在今日推荐卡上"
            />
          </label>
          <label className="ops-field">
            <span>说明</span>
            <textarea
              className="input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
            />
          </label>
          {(templateId === 'multi_day' || templateId === 'verse_day' || templateId === 'memory') && (
            <label className="ops-field">
              <span>日课（每天一段，空行分隔；首行可作标题）</span>
              <textarea
                className="input"
                value={daysText}
                onChange={(e) => setDaysText(e.target.value)}
                rows={10}
                style={{ fontFamily: 'inherit' }}
              />
            </label>
          )}
          {templateId === 'gathering' && (
            <label className="ops-field">
              <span>地点 / 线上说明</span>
              <input
                className="input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </label>
          )}
          {templateId === 'hub' ? (
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              「多入口」默认带 2 个入口；创建后可在编辑页增删入口与主按钮。
            </p>
          ) : null}
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
            <label className="ops-field">
              <span>开始</span>
              <input
                className="input"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </label>
            <label className="ops-field">
              <span>结束</span>
              <input
                className="input"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </label>
          </div>
          <div className="ops-sticky-bar">
            <button type="button" className="btn" onClick={() => setStep(2)} disabled={busy}>
              上一步
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void publish(true)}>
              存草稿
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !groupIds.length}
              onClick={() => void publish(false)}
            >
              {busy ? '发布中…' : '对群成员发布'}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

