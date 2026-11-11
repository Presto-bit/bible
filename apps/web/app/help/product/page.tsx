'use client';

import PageBackBar from '@/components/PageBackBar';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';
import {
  PROFILE_SETTINGS_BACK_LABEL,
  PROFILE_SETTINGS_HREF,
} from '@/lib/profile_settings';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { formatChangelogMonth } from '@/lib/product_changelog_format';
import {
  PRODUCT_GUIDE_INTRO,
  PRODUCT_GUIDE_SECTIONS,
  PRODUCT_GUIDE_VERSION,
} from '@/lib/user_product_guide';

export default function ProductGuidePage() {
  useEdgeSwipeBack({ href: PROFILE_SETTINGS_HREF });

  return (
    <main className="container product-guide">
      <header className="page-head">
        <PageBackBar
          href={PROFILE_SETTINGS_HREF}
          label={PROFILE_SETTINGS_BACK_LABEL}
          onClick={() => markRouteNavigation()}
        />
        <h2 className="page-head-title">产品说明</h2>
      </header>

      <p className="muted product-guide-intro">{PRODUCT_GUIDE_INTRO}</p>
      <p className="muted product-guide-version">
        文档修订 {formatChangelogMonth(PRODUCT_GUIDE_VERSION)}
      </p>

      <nav className="product-guide-toc" aria-label="本页目录">
        <ul>
          {PRODUCT_GUIDE_SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-link">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {PRODUCT_GUIDE_SECTIONS.map((section) => (
        <section
          key={section.id}
          id={section.id}
          className="settings-card product-guide-section"
        >
          <h3 className="settings-title">{section.title}</h3>
          {section.paragraphs.map((p) => (
            <p key={p} className="muted product-guide-p">
              {p}
            </p>
          ))}
          {section.bullets?.length ? (
            <ul className="product-guide-ul">
              {section.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </main>
  );
}
