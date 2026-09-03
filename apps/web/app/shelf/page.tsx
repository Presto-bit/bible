'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import ShelfBookCard from '@/components/shelf/ShelfBookCard';
import ShelfLibraryHeader from '@/components/shelf/ShelfLibraryHeader';
import ShelfLibraryTabs from '@/components/shelf/ShelfLibraryTabs';
import ShelfManageSheet from '@/components/shelf/ShelfManageSheet';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { useSuppressKeepAliveRoute } from '@/components/shell/TabKeepAliveContext';
import { adminCheck } from '@/lib/admin_rag';
import { canManageShelf } from '@/lib/shelf_admin';
import {
  invalidateShelfListCache,
  listPlatformShelfFull,
  type ShelfBookSummary,
  type ShelfGroup,
} from '@/lib/shelf_api';
import {
  filterAndSortShelfBooks,
  listShelfUserGroups,
  SHELF_MAX_USER_GROUPS,
  shelfUngroupedCount,
  type ShelfLibraryTab,
  type ShelfUserGroup,
} from '@/lib/shelf_library';
import { peekShelfListCache } from '@/lib/shelf_cache';
import '@/styles/shelf.css';

const ShelfImportSheet = dynamic(() => import('@/components/shelf/ShelfImportSheet'), { ssr: false });
const ShelfLibrarySheet = dynamic(() => import('@/components/shelf/ShelfLibrarySheet'), { ssr: false });
const ShelfCheckinSheet = dynamic(() => import('@/components/shelf/ShelfCheckinSheet'), { ssr: false });
const ShelfBookActionPopover = dynamic(
  () => import('@/components/shelf/ShelfBookActionPopover'),
  { ssr: false },
);

export default function ShelfPage() {
  const suppress = useSuppressKeepAliveRoute();
  if (suppress) return null;
  return <ShelfListInner />;
}

function ShelfListInner() {
  useEdgeSwipeBack({ href: '/profile' });

  const cached = peekShelfListCache(true);
  const [groups, setGroups] = useState<ShelfGroup[]>(() => cached?.groups ?? []);
  const [items, setItems] = useState<ShelfBookSummary[]>(() => cached?.items ?? []);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(() => !cached);
  const [canManage, setCanManage] = useState(false);
  const [manageBook, setManageBook] = useState<ShelfBookSummary | null>(null);
  const [userGroups, setUserGroups] = useState<ShelfUserGroup[]>(() => listShelfUserGroups());
  const [activeTab, setActiveTab] = useState<ShelfLibraryTab>({ kind: 'last_read' });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [librarySheet, setLibrarySheet] = useState<
    null | { mode: 'new_group' | 'move_book' | 'edit_group'; book?: ShelfBookSummary; group?: ShelfUserGroup }
  >(null);
  const [bookActionMenu, setBookActionMenu] = useState<{
    book: ShelfBookSummary;
    anchorEl: HTMLElement;
  } | null>(null);
  const [shareBook, setShareBook] = useState<ShelfBookSummary | null>(null);
  const [libraryTick, setLibraryTick] = useState(0);

  const reload = useCallback((force = false) => {
    if (force) invalidateShelfListCache();
    setLoading(true);
    setErr('');
    return listPlatformShelfFull()
      .then((data) => {
        setGroups(data.groups ?? []);
        setItems(data.items ?? []);
      })
      .catch(() => setErr('暂时无法加载书架'))
      .finally(() => setLoading(false));
  }, []);

  const refreshLibrary = useCallback(() => {
    setUserGroups(listShelfUserGroups());
    setLibraryTick((n) => n + 1);
  }, []);

  useEffect(() => {
    void reload(false);
  }, [reload]);

  useEffect(() => {
    const onLibraryChanged = () => refreshLibrary();
    window.addEventListener('presto-shelf-library-changed', onLibraryChanged);
    return () => window.removeEventListener('presto-shelf-library-changed', onLibraryChanged);
  }, [refreshLibrary]);

  useEffect(() => {
    if (!canManageShelf()) {
      setCanManage(false);
      return;
    }
    void adminCheck().then(setCanManage);
  }, []);

  const visibleBooks = useMemo(
    () => filterAndSortShelfBooks(items, activeTab, searchQuery),
    [items, activeTab, searchQuery, libraryTick],
  );

  const showUngrouped = useMemo(() => shelfUngroupedCount(items) > 0, [items, libraryTick]);

  return (
    <main className="container shelf-page shelf-library-page">
      <ShelfLibraryHeader
        searchOpen={searchOpen}
        searchQuery={searchQuery}
        onSearchOpen={setSearchOpen}
        onSearchQuery={setSearchQuery}
        onImport={() => setImportOpen(true)}
      />

      <ShelfLibraryTabs
        active={activeTab}
        userGroups={userGroups}
        showUngrouped={showUngrouped}
        canAddGroup={userGroups.length < SHELF_MAX_USER_GROUPS}
        onSelect={(tab) => {
          if (tab.kind === 'progress' && activeTab.kind !== 'progress') {
            setActiveTab({ kind: 'progress', status: 'reading' });
            return;
          }
          setActiveTab(tab);
        }}
        onAddGroup={() => setLibrarySheet({ mode: 'new_group' })}
        onLongPressGroup={(group) => setLibrarySheet({ mode: 'edit_group', group })}
      />

      {loading ? <p className="muted shelf-library-status">加载中…</p> : null}
      {err ? <p className="muted shelf-library-status">{err}</p> : null}

      {!loading && !err && visibleBooks.length === 0 ? (
        <p className="muted shelf-library-status">
          {searchQuery
            ? '没有匹配的书'
            : activeTab.kind === 'last_read'
              ? '还没有最近阅读的书'
              : activeTab.kind === 'progress'
                ? '暂无符合条件的书'
                : '书架空空的，可导入或选一本平台书目'}
        </p>
      ) : null}

      {visibleBooks.length > 0 ? (
        <div className="shelf-grid shelf-library-grid">
          {visibleBooks.map((book) => (
            <ShelfBookCard
              key={book.id}
              book={book}
              actionMenuOpen={bookActionMenu?.book.id === book.id}
              onActionMenu={(b, anchorEl) => setBookActionMenu({ book: b, anchorEl })}
            />
          ))}
        </div>
      ) : null}

      {importOpen ? <ShelfImportSheet onClose={() => setImportOpen(false)} /> : null}

      {bookActionMenu ? (
        <ShelfBookActionPopover
          open
          book={bookActionMenu.book}
          anchorEl={bookActionMenu.anchorEl}
          canManage={canManage}
          onClose={() => setBookActionMenu(null)}
          onMoveGroup={(book) => {
            setBookActionMenu(null);
            setLibrarySheet({ mode: 'move_book', book });
          }}
          onShare={(book) => {
            setBookActionMenu(null);
            setShareBook(book);
          }}
          onManage={(book) => {
            setBookActionMenu(null);
            setManageBook(book);
          }}
        />
      ) : null}

      {shareBook ? (
        <ShelfCheckinSheet
          bookId={shareBook.id}
          bookTitle={shareBook.title}
          onClose={() => setShareBook(null)}
        />
      ) : null}

      {librarySheet ? (
        <ShelfLibrarySheet
          mode={librarySheet.mode}
          book={librarySheet.book}
          group={librarySheet.group}
          onClose={() => setLibrarySheet(null)}
          onChanged={refreshLibrary}
        />
      ) : null}

      <ShelfManageSheet
        book={manageBook}
        groups={groups}
        onClose={() => setManageBook(null)}
        onChanged={() => void reload(true)}
      />
    </main>
  );
}
