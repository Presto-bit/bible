/** Next.js basePath（生产 2sc.prestoai.cn 为空；本地或旧路径可设 /2sc） */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function withBasePath(path: string): string {
  if (!path.startsWith('/')) return `${BASE_PATH}/${path}`;
  if (!BASE_PATH) return path;
  return `${BASE_PATH}${path}`;
}
