/**
 * 字体：构建期不拉 Google Fonts。
 *
 * next/font/google 在 Docker/国内机常因 fonts.gstatic.com ECONNRESET 失败；
 * 且 Noto SC 仅配 latin 子集时，中文本就依赖系统栈。此处只声明 CSS 变量名，
 * 实际字形见 design_tokens 的 --font-ui / --font-reader 回退链（PingFang / 系统宋体等）。
 */

/** 与历史 next/font variable 名对齐，供 token 引用 */
export const peiaiSans = { variable: '--font-peiai-sans' as const };
export const peiaiSerif = { variable: '--font-peiai-serif' as const };

/** 挂到 <html>：不再注入 google 字体 class */
export const peiaiFontClassNames = '';
