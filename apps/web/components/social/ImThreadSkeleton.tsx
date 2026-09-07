/** 私聊 / 群聊首屏骨架：气泡占位，避免 API 返回前白屏。 */

type Props = {
  variant?: 'dm' | 'group';
};

export function ImThreadSkeleton({ variant = 'dm' }: Props) {
  return (
    <div className="im-thread-skeleton" aria-busy="true" aria-label="加载消息">
      <div className="im-thread-skel-row im-thread-skel-row--left">
        <span className="im-thread-skel-bubble im-thread-skel-bubble--short" />
      </div>
      <div className="im-thread-skel-row im-thread-skel-row--right">
        <span className="im-thread-skel-bubble im-thread-skel-bubble--mid" />
      </div>
      <div className="im-thread-skel-row im-thread-skel-row--left">
        <span className="im-thread-skel-bubble im-thread-skel-bubble--long" />
      </div>
      {variant === 'group' ? (
        <div className="im-thread-skel-row im-thread-skel-row--left">
          <span className="im-thread-skel-bubble im-thread-skel-bubble--mid" />
        </div>
      ) : null}
    </div>
  );
}

export function DiscoverTabSkeleton() {
  return (
    <main className="container discover-page discover-im" aria-busy="true" aria-label="加载消息">
      <div className="discover-im-top" style={{ padding: '0 16px' }}>
        <h1 className="discover-im-title">消息</h1>
      </div>
      <ul className="discover-conv-skeleton" aria-hidden>
        {[0, 1, 2].map((i) => (
          <li key={i} className="discover-conv-skeleton-row">
            <span className="discover-conv-skeleton-avatar" />
            <span className="discover-conv-skeleton-lines">
              <span className="discover-conv-skeleton-line w60" />
              <span className="discover-conv-skeleton-line w40" />
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}

export function DiscoverContactsSkeleton() {
  return (
    <div className="discover-contacts-skeleton" aria-busy="true" aria-label="加载通讯录">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="discover-contacts-skeleton-row">
          <span className="discover-conv-skeleton-avatar" />
          <span className="discover-conv-skeleton-lines">
            <span className="discover-conv-skeleton-line w60" />
            <span className="discover-conv-skeleton-line w40" />
          </span>
        </div>
      ))}
    </div>
  );
}
