/**
 * 自托管字体（next/font 构建时拉取并本地化），
 * 安卓壳 / iOS PWA 共用同一字形，避免仅依赖 PingFang vs 系统黑体。
 */
import { Noto_Sans_SC, Noto_Serif_SC } from 'next/font/google';

/** UI 无衬线：限 400/500/600，控制体积 */
export const peiaiSans = Noto_Sans_SC({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-peiai-sans',
  preload: true,
  adjustFontFallback: true,
});

/** 读经 / 每日经文衬线：限 400/600 */
export const peiaiSerif = Noto_Serif_SC({
  weight: ['400', '600'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-peiai-serif',
  preload: false,
  adjustFontFallback: true,
});

/** 挂到 <html> 的 className */
export const peiaiFontClassNames = `${peiaiSans.variable} ${peiaiSerif.variable}`;
