'use client';

import { useCallback, useRef, useState } from 'react';
import PageBackBar from '@/components/PageBackBar';
import { shellTapProps } from '@/lib/shell_tap';

type Props = {
  searchOpen: boolean;
  searchQuery: string;
  onSearchOpen: (open: boolean) => void;
  onSearchQuery: (q: string) => void;
  onImport: () => void;
};

export default function ShelfLibraryHeader({
  searchOpen,
  searchQuery,
  onSearchOpen,
  onSearchQuery,
  onImport,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openSearch = useCallback(() => {
    onSearchOpen(true);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [onSearchOpen]);

  return (
    <header className="shelf-library-header">
      <PageBackBar href="/profile" label="我的" />
      {searchOpen ? (
        <div className="shelf-library-search-row">
          <input
            ref={inputRef}
            type="search"
            className="shelf-library-search-input"
            placeholder="搜索书名或作者"
            value={searchQuery}
            onChange={(e) => onSearchQuery(e.target.value)}
            aria-label="搜索书架"
          />
          <button
            type="button"
            className="shelf-library-icon-btn"
            aria-label="关闭搜索"
            {...shellTapProps({ onTap: () => { onSearchQuery(''); onSearchOpen(false); } })}
          >
            ✕
          </button>
        </div>
      ) : (
        <>
          <h1 className="shelf-library-title">书架</h1>
          <div className="shelf-library-actions">
            <button
              type="button"
              className="shelf-library-icon-btn"
              aria-label="搜索"
              {...shellTapProps({ onTap: openSearch })}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3-3" />
              </svg>
            </button>
            <button
              type="button"
              className="shelf-library-icon-btn shelf-library-icon-btn-accent"
              aria-label="导入书籍"
              {...shellTapProps({ onTap: onImport })}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
        </>
      )}
    </header>
  );
}
