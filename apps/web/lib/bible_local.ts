/** 本地 SQLite 经库（sql.js + IndexedDB 经包，支持 CNV / CUVS）。 */

import type { Database, SqlJsStatic } from 'sql.js';
import type { BibleBook, Verse } from './api';
import { withBasePath } from './basePath';
import {
  loadOfflineSqliteBytes,
  type OfflineTranslation,
} from './offline_pack';

const dbPromises: Partial<Record<OfflineTranslation, Promise<Database | null>>> = {};

/** sql.js 浏览器包请求 sql-wasm-browser.wasm，静态资源目录只有 sql-wasm.wasm */
function mapSqlWasmFile(file: string): string {
  if (file === 'sql-wasm-browser.wasm') return 'sql-wasm.wasm';
  if (file === 'sql-wasm-browser.js') return 'sql-wasm.js';
  return file;
}

function sqlWasmUrl(file: string): string {
  return withBasePath(`/sql-wasm/${mapSqlWasmFile(file)}`);
}

const BOOKS_FALLBACK_URL = withBasePath('/offline/books.json');
const BOOKS_LS_KEY = 'presto_books_cache_v1';
let booksCache: BibleBook[] | null = null;

function readBooksLsCache(): BibleBook[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BOOKS_LS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { books: BibleBook[] };
    return data.books?.length ? data.books : null;
  } catch {
    return null;
  }
}

export function writeBooksLsCache(books: BibleBook[]) {
  if (typeof window === 'undefined' || !books.length) return;
  try {
    localStorage.setItem(BOOKS_LS_KEY, JSON.stringify({ books }));
  } catch {
    /* quota */
  }
}

async function loadSqlFromPublic(): Promise<SqlJsStatic> {
  const jsUrl = withBasePath('/sql-wasm/sql-wasm.js');
  const initSqlJs = (await import(
    /* webpackIgnore: true */
    jsUrl
  )).default as (config: { locateFile: (file: string) => string }) => Promise<SqlJsStatic>;
  return initSqlJs({ locateFile: sqlWasmUrl });
}

async function getSql(): Promise<SqlJsStatic> {
  const g = globalThis as { __prestoSqlJs?: Promise<SqlJsStatic> };
  if (!g.__prestoSqlJs) {
    g.__prestoSqlJs = (async () => {
      try {
        return await loadSqlFromPublic();
      } catch {
        const mod = await import('sql.js');
        return mod.default({ locateFile: sqlWasmUrl });
      }
    })().catch((err) => {
      delete g.__prestoSqlJs;
      throw err;
    });
  }
  return g.__prestoSqlJs;
}

export async function getLocalBibleDb(
  translation: OfflineTranslation = 'cnv',
): Promise<Database | null> {
  if (typeof window === 'undefined') return null;
  if (!dbPromises[translation]) {
    dbPromises[translation] = (async () => {
      try {
        const buf = await loadOfflineSqliteBytes(translation);
        if (!buf) return null;
        const SQL = await getSql();
        return new SQL.Database(new Uint8Array(buf));
      } catch {
        delete dbPromises[translation];
        return null;
      }
    })();
  }
  return dbPromises[translation]!;
}

export function resetLocalBibleDb() {
  for (const k of Object.keys(dbPromises) as OfflineTranslation[]) {
    delete dbPromises[k];
  }
}

export async function loadBooksJson(opts?: { fresh?: boolean }): Promise<BibleBook[] | null> {
  if (!opts?.fresh) {
    if (booksCache?.length) return booksCache;

    const ls = readBooksLsCache();
    if (ls?.length) {
      booksCache = ls;
      return ls;
    }
  }

  try {
    const online = typeof navigator !== 'undefined' && navigator.onLine;
    const res = await fetch(BOOKS_FALLBACK_URL, {
      cache: online ? 'no-cache' : 'force-cache',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { books: BibleBook[] };
    if (data.books?.length) {
      booksCache = data.books;
      writeBooksLsCache(data.books);
      return booksCache;
    }
  } catch {
    /* network */
  }
  return null;
}

/** 仅从本地 SQLite 读经卷目录（不读 books.json，避免被慢 sql 阻塞）。 */
export async function listLocalBooksFromDb(): Promise<BibleBook[] | null> {
  const db = await getLocalBibleDb('cnv');
  if (!db) return null;
  try {
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
  } catch {
    resetLocalBibleDb();
  }
  return null;
}

export async function listLocalBooks(): Promise<BibleBook[] | null> {
  const dbBooks = await listLocalBooksFromDb();
  if (dbBooks?.length) return dbBooks;
  return loadBooksJson();
}

export async function getLocalChapter(
  bookId: string,
  chapter: number,
  translation: OfflineTranslation = 'cnv',
): Promise<Verse[] | null> {
  const db = await getLocalBibleDb(translation);
  if (!db) return null;
  const ids = [bookId, bookId.toUpperCase(), bookId.toLowerCase()];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const stmt = db.prepare(
      'SELECT verse, text FROM verses WHERE book = ? AND chapter = ? ORDER BY verse',
    );
    stmt.bind([id, chapter]);
    const out: Verse[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { verse: number; text: string };
      out.push({ verse: Number(row.verse), text: String(row.text) });
    }
    stmt.free();
    if (out.length) return out;
  }
  return null;
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
  try {
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
  } catch {
    resetLocalBibleDb();
    return null;
  }
}
