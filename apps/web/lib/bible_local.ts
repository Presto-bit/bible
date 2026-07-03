/** 本地 SQLite 经库（sql.js + IndexedDB 经包，支持 CNV / CUVS）。 */

import type { Database, SqlJsStatic } from 'sql.js';
import type { BibleBook, Verse } from './api';
import {
  loadOfflineSqliteBytes,
  type OfflineTranslation,
} from './offline_pack';

const dbPromises: Partial<Record<OfflineTranslation, Promise<Database | null>>> = {};

async function getSql(): Promise<SqlJsStatic> {
  const g = globalThis as { __prestoSqlJs?: Promise<SqlJsStatic> };
  if (!g.__prestoSqlJs) {
    g.__prestoSqlJs = import('sql.js').then((mod) =>
      mod.default({
        locateFile: (file: string) => `/sql-wasm/${file}`,
      }),
    );
  }
  return g.__prestoSqlJs;
}

export async function getLocalBibleDb(
  translation: OfflineTranslation = 'cnv',
): Promise<Database | null> {
  if (typeof window === 'undefined') return null;
  if (!dbPromises[translation]) {
    dbPromises[translation] = (async () => {
      const buf = await loadOfflineSqliteBytes(translation);
      if (!buf) return null;
      const SQL = await getSql();
      return new SQL.Database(new Uint8Array(buf));
    })();
  }
  return dbPromises[translation]!;
}

export function resetLocalBibleDb() {
  for (const k of Object.keys(dbPromises) as OfflineTranslation[]) {
    delete dbPromises[k];
  }
}

const BOOKS_FALLBACK_URL = '/offline/books.json';
let booksCache: BibleBook[] | null = null;

export async function listLocalBooks(): Promise<BibleBook[] | null> {
  const db = await getLocalBibleDb('cnv');
  if (db) {
    const rows = db.exec(
      'SELECT id, name, testament, chapter_count FROM books ORDER BY sort_order',
    );
    if (rows[0]?.values?.length) {
      return rows[0].values.map((r) => ({
        id: String(r[0]),
        name: String(r[1]),
        testament: String(r[2]),
        chapter_count: Number(r[3]),
      }));
    }
  }
  if (booksCache) return booksCache;
  try {
    const res = await fetch(BOOKS_FALLBACK_URL, { cache: 'force-cache' });
    if (!res.ok) return null;
    const data = (await res.json()) as { books: BibleBook[] };
    booksCache = data.books;
    return booksCache;
  } catch {
    return null;
  }
}

export async function getLocalChapter(
  bookId: string,
  chapter: number,
  translation: OfflineTranslation = 'cnv',
): Promise<Verse[] | null> {
  const db = await getLocalBibleDb(translation);
  if (!db) return null;
  const stmt = db.prepare(
    'SELECT verse, text FROM verses WHERE book = ? AND chapter = ? ORDER BY verse',
  );
  stmt.bind([bookId.toUpperCase(), chapter]);
  const out: Verse[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { verse: number; text: string };
    out.push({ verse: Number(row.verse), text: String(row.text) });
  }
  stmt.free();
  return out.length ? out : null;
}

export interface LocalSearchHit {
  book: string;
  name: string;
  chapter: number;
  verse: number;
  text: string;
}

export async function searchLocalVerses(
  query: string,
  limit = 24,
): Promise<LocalSearchHit[] | null> {
  const db = await getLocalBibleDb('cnv');
  if (!db) return null;
  const q = query.trim();
  if (!q) return [];
  const stmt = db.prepare(
    `SELECT v.book, b.name, v.chapter, v.verse, v.text
     FROM verses v JOIN books b ON b.id = v.book
     WHERE v.text LIKE ? ESCAPE '\\'
     ORDER BY b.sort_order, v.chapter, v.verse
     LIMIT ?`,
  );
  stmt.bind([`%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`, limit]);
  const out: LocalSearchHit[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as unknown as LocalSearchHit;
    out.push({
      book: String(row.book),
      name: String(row.name),
      chapter: Number(row.chapter),
      verse: Number(row.verse),
      text: String(row.text),
    });
  }
  stmt.free();
  return out;
}
