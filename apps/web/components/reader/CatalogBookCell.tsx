'use client';

import { catalogBookSubline, bookAbbr } from '@/lib/book_abbr';

type Props = {
  bookId: string;
  name: string;
  chapterCount?: number;
  englishUI?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
  /** 全屏目录 catalog-card · 弹层 reader-loc-book-cell */
  variant: 'catalog-card' | 'reader-loc-book-cell';
  extraClassName?: string;
  htmlId?: string;
};

export function CatalogBookCell({
  bookId,
  name,
  chapterCount,
  englishUI = false,
  selected = false,
  disabled = false,
  onClick,
  variant,
  extraClassName = '',
  htmlId,
}: Props) {
  const abbr = bookAbbr(name, bookId, englishUI);
  const subline = catalogBookSubline(bookId, name, englishUI);
  const ariaLabel =
    englishUI && chapterCount != null
      ? `${name}, ${chapterCount} chapters`
      : chapterCount != null
        ? `${name}，${chapterCount}章`
        : name;

  const base =
    variant === 'catalog-card'
      ? `catalog-card${selected ? ' catalog-card-active' : ''}${extraClassName}`
      : `reader-loc-book-cell${selected ? ' is-active' : ''}${extraClassName}`;

  return (
    <button
      id={htmlId}
      type="button"
      className={base}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      title={name}
    >
      <span className="catalog-abbr">{abbr}</span>
      <span className="catalog-name">{subline}</span>
    </button>
  );
}