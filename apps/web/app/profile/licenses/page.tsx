'use client';

import PageBackBar from '@/components/PageBackBar';
import {
  CONTENT_ATTRIBUTION_SECTIONS,
  licenseLabel,
} from '@/lib/content_attribution';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';

export default function LicensesPage() {
  useEdgeSwipeBack({ href: '/profile' });

  return (
    <main className="container">
      <header className="page-head">
        <PageBackBar href="/profile" label="我的" />
        <h2 className="page-head-title">数据来源与许可</h2>
      </header>

      <p className="muted" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.7 }}>
        本页列出应用内主要经文、资料与 AI 功能的数据来源及许可说明，便于合规审查与用户查阅。
        具体权利以各权利人及开源许可文本为准。
      </p>

      {CONTENT_ATTRIBUTION_SECTIONS.map((section) => (
        <div key={section.id} className="settings-card" style={{ marginTop: 12 }}>
          <p className="settings-title">{section.title}</p>
          {section.intro ? (
            <p className="muted" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.7 }}>
              {section.intro}
            </p>
          ) : null}
          <div className="license-list">
            {section.items.map((item) => (
              <div key={item.id} className="license-row">
                <div className="license-row-main">
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="license-row-name"
                    >
                      {item.name}
                    </a>
                  ) : (
                    <strong className="license-row-name">{item.name}</strong>
                  )}
                  <span className="license-badge">{licenseLabel(item.license)}</span>
                  {item.note ? (
                    <p className="muted license-row-note">{item.note}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="muted settings-version-line" style={{ marginTop: 20 }}>
        如有版权疑问，请通过应用内反馈或联系运营方。
      </p>
    </main>
  );
}
