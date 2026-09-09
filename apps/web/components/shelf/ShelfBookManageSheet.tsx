'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import AppBodyPortal from '@/components/AppBodyPortal';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';
import {
  deleteCollectionSection,
  deletePlatformShelfBook,
  getPlatformShelfBook,
  updateCollectionSection,
  updatePlatformShelfBook,
  type ShelfBookDetail,
  type ShelfBookSummary,
} from '@/lib/shelf_api';
import { invalidateShelfBookCache } from '@/lib/shelf_cache';
import { shellTapProps } from '@/lib/shell_tap';

const ShelfAppendLessonSheet = dynamic(
  () => import('@/components/shelf/ShelfAppendLessonSheet'),
  { ssr: false },
);

type Props = {
  book: ShelfBookSummary | null;
  onClose: () => void;
  onChanged: () => void;
};

export default function ShelfBookManageSheet({ book, onClose, onChanged }: Props) {
  const confirm = useConfirm();
  const toast = useToast();
  const [detail, setDetail] = useState<ShelfBookDetail | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [appendOpen, setAppendOpen] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionTitle, setSectionTitle] = useState('');

  const isCollection = book?.book_type === 'collection';

  useEffect(() => {
    if (!book) {
      setDetail(null);
      return;
    }
    setTitle(book.title);
    setSubtitle(book.subtitle || '');
    if (book.book_type !== 'collection') return;
    let cancelled = false;
    setLoading(true);
    void getPlatformShelfBook(book.id)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) toast('加载资料列表失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [book, toast]);

  if (!book) return null;

  const closeAll = () => {
    if (busy) return;
    onClose();
  };

  const reloadDetail = async () => {
    const d = await getPlatformShelfBook(book.id);
    setDetail(d);
    invalidateShelfBookCache(book.id);
    onChanged();
  };

  const saveMeta = async () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      toast('名称不能为空');
      return;
    }
    setBusy(true);
    try {
      await updatePlatformShelfBook(book.id, {
        title: nextTitle,
        subtitle: subtitle.trim() || undefined,
      });
      toast('已更新');
      invalidateShelfBookCache(book.id);
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const deleteBook = async () => {
    const count = detail?.sections?.length ?? book.section_count ?? 0;
    const ok = await confirm({
      title: isCollection ? '删除整个合集？' : '下架此书？',
      message: isCollection
        ? `「${book.title}」及全部 ${count} 份资料将从书架移除，并删除服务器文件。`
        : `「${book.title}」将从书架移除，并删除服务器上的书籍文件。`,
      confirmLabel: isCollection ? '删除合集' : '下架删除',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deletePlatformShelfBook(book.id);
      toast(isCollection ? '已删除合集' : '已下架');
      invalidateShelfBookCache(book.id);
      onChanged();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : '删除失败');
    } finally {
      setBusy(false);
    }
  };

  const startEditSection = (sectionId: string, currentTitle: string) => {
    setEditingSectionId(sectionId);
    setSectionTitle(currentTitle);
  };

  const saveSectionTitle = async (sectionId: string) => {
    const next = sectionTitle.trim();
    if (!next) {
      toast('标题不能为空');
      return;
    }
    setBusy(true);
    try {
      await updateCollectionSection(book.id, sectionId, { title: next });
      toast('已更新');
      setEditingSectionId(null);
      await reloadDetail();
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const removeSection = async (sectionId: string, sectionLabel: string) => {
    const ok = await confirm({
      title: `删除「${sectionLabel}」？`,
      message: '将从合集中移除，并删除对应文件。此操作不可恢复。',
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteCollectionSection(book.id, sectionId);
      toast('已删除');
      setEditingSectionId(null);
      await reloadDetail();
    } catch (e) {
      toast(e instanceof Error ? e.message : '删除失败');
    } finally {
      setBusy(false);
    }
  };

  const sections = detail?.sections ?? [];

  return (
    <AppBodyPortal onTabAway={closeAll}>
      <div className="shelf-sheet-backdrop" onClick={closeAll} role="presentation" />
      <div className="shelf-import-sheet shelf-manage-user-sheet" role="dialog" aria-modal="true" aria-label="管理书籍">
        <div className="shelf-import-head">
          <strong>{isCollection ? '管理合集' : '管理书籍'}</strong>
          <button type="button" className="icon-btn" aria-label="关闭" {...shellTapProps({ onTap: closeAll })}>✕</button>
        </div>

        <label className="shelf-import-field">
          <span className="muted">{isCollection ? '合集名称' : '书名'}</span>
          <input
            type="text"
            maxLength={80}
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="shelf-import-field">
          <span className="muted">副标题（可选）</span>
          <input
            type="text"
            maxLength={160}
            value={subtitle}
            disabled={busy}
            onChange={(e) => setSubtitle(e.target.value)}
          />
        </label>
        <button
          type="button"
          className={`btn primary shelf-import-btn${busy ? ' is-disabled' : ''}`}
          disabled={busy}
          {...shellTapProps({ onTap: () => void saveMeta() })}
        >
          保存名称
        </button>

        {isCollection ? (
          <>
            <div className="shelf-manage-section-head">
              <span className="muted">资料（{sections.length} 份）</span>
              <button
                type="button"
                className="btn ghost shelf-manage-add-btn"
                disabled={busy}
                {...shellTapProps({ onTap: () => setAppendOpen(true) })}
              >
                添加资料
              </button>
            </div>
            {loading ? <p className="muted shelf-import-hint">加载中…</p> : null}
            {!loading && sections.length === 0 ? (
              <p className="muted shelf-import-hint">还没有资料，可点「添加资料」</p>
            ) : null}
            <ul className="shelf-manage-section-list">
              {sections.map((sec) => (
                <li key={sec.id} className="shelf-manage-section-item">
                  {editingSectionId === sec.id ? (
                    <div className="shelf-manage-section-edit">
                      <input
                        type="text"
                        maxLength={120}
                        value={sectionTitle}
                        disabled={busy}
                        onChange={(e) => setSectionTitle(e.target.value)}
                      />
                      <div className="shelf-manage-section-edit-actions">
                        <button type="button" className="btn ghost" disabled={busy} {...shellTapProps({ onTap: () => setEditingSectionId(null) })}>
                          取消
                        </button>
                        <button type="button" className="btn" disabled={busy} {...shellTapProps({ onTap: () => void saveSectionTitle(sec.id) })}>
                          保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="shelf-manage-section-main">
                        <span className="shelf-manage-section-title">{sec.title}</span>
                        {sec.unit ? <span className="muted shelf-manage-section-unit">{sec.unit}</span> : null}
                      </div>
                      <div className="shelf-manage-section-actions">
                        <button type="button" className="btn ghost" disabled={busy} {...shellTapProps({ onTap: () => startEditSection(sec.id, sec.title) })}>
                          改名
                        </button>
                        <button type="button" className="btn ghost is-danger" disabled={busy} {...shellTapProps({ onTap: () => void removeSection(sec.id, sec.title) })}>
                          删除
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <button
          type="button"
          className={`btn ghost shelf-manage-delete-book${busy ? ' is-disabled' : ''}`}
          disabled={busy}
          {...shellTapProps({ onTap: () => void deleteBook() })}
        >
          {isCollection ? '删除整个合集' : '下架删除'}
        </button>
      </div>

      {appendOpen ? (
        <ShelfAppendLessonSheet
          bookId={book.id}
          bookTitle={title.trim() || book.title}
          onClose={() => setAppendOpen(false)}
          onAdded={() => void reloadDetail()}
        />
      ) : null}
    </AppBodyPortal>
  );
}
