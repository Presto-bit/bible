'use client';

import type { ReactNode, Ref } from 'react';

type Props = {
  barRef?: Ref<HTMLElement>;
  className?: string;
  plusOpen?: boolean;
  mentionOpen?: boolean;
  selectMode?: boolean;
  children: ReactNode;
};

/** 群聊 / 私聊共用输入栏外壳。格子和发送逻辑由各页填入。 */
export function ImComposerDock({
  barRef,
  className = '',
  plusOpen,
  mentionOpen,
  selectMode,
  children,
}: Props) {
  return (
    <footer
      ref={barRef as Ref<HTMLElement>}
      className={[
        'im-composer-bar',
        'im-composer-dock',
        className,
        plusOpen ? 'is-plus-open' : '',
        mentionOpen ? 'is-mention-open' : '',
        selectMode ? 'is-select-dock' : '',
      ].filter(Boolean).join(' ')}
    >
      {children}
    </footer>
  );
}
