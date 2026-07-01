/// 圣经主题插画头像：5 套配色 × 10 款场景 = 50 款预设。
///
/// 与 H5（components/Avatar.tsx）共用同一 SVG 规格，确保两端视觉一致。
/// 直接拼出与 React 端逐字节相同的 SVG 标记，交由 flutter_svg 渲染。
library;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

class AvatarPalette {
  const AvatarPalette({
    required this.name,
    required this.sky1,
    required this.sky2,
    required this.hill,
    required this.ink,
    required this.light,
    required this.sun,
    required this.accent,
  });
  final String name;
  final String sky1;
  final String sky2;
  final String hill;
  final String ink;
  final String light;
  final String sun;
  final String accent;
}

const avatarPalettes = <AvatarPalette>[
  AvatarPalette(name: '晨曦', sky1: '#FFE7C9', sky2: '#F6B79C', hill: '#E59079', ink: '#7A3B2E', light: '#FFF6EC', sun: '#FFD27A', accent: '#FFFFFF'),
  AvatarPalette(name: '晴日', sky1: '#CFEBFF', sky2: '#8FC7F0', hill: '#7FC08C', ink: '#2C5A78', light: '#FFFFFF', sun: '#FFE08A', accent: '#FFFFFF'),
  AvatarPalette(name: '暮色', sky1: '#FAD7B0', sky2: '#D58FB4', hill: '#8E6FA8', ink: '#562C57', light: '#FFF3E6', sun: '#FF9E5E', accent: '#FFF0D8'),
  AvatarPalette(name: '星夜', sky1: '#33407A', sky2: '#161F3D', hill: '#101A35', ink: '#0A1226', light: '#EEF3FF', sun: '#FBE38A', accent: '#DCE5FF'),
  AvatarPalette(name: '新绿', sky1: '#E0F4E7', sky2: '#A6E0C6', hill: '#71C49A', ink: '#2C6B52', light: '#FFFFFF', sun: '#FFE08A', accent: '#FFFFFF'),
];

const avatarScenes = <({String key, String label})>[
  (key: 'dove', label: '平安鸽'),
  (key: 'olive', label: '橄榄枝'),
  (key: 'mountain', label: '晨光山'),
  (key: 'anchor', label: '盼望锚'),
  (key: 'candle', label: '灯台'),
  (key: 'book', label: '话语'),
  (key: 'vine', label: '葡萄树'),
  (key: 'starnight', label: '星夜'),
  (key: 'wheat', label: '麦田'),
  (key: 'lily', label: '百合'),
];

class PresetAvatar {
  const PresetAvatar({
    required this.id,
    required this.scene,
    required this.palette,
    required this.label,
  });
  final String id;
  final int scene;
  final int palette;
  final String label;
}

final presetAvatars = List<PresetAvatar>.generate(50, (i) {
  final scene = i % avatarScenes.length;
  final palette = (i ~/ avatarScenes.length) % avatarPalettes.length;
  return PresetAvatar(
    id: 'a${i + 1}',
    scene: scene,
    palette: palette,
    label: '${avatarScenes[scene].label}·${avatarPalettes[palette].name}',
  );
});

/// 无显式选择时按 seed（用户 id/昵称）确定性挑一个，保证多端一致。
String defaultAvatarId([String? seed]) {
  if (seed == null || seed.isEmpty) return 'a1';
  var h = 0;
  for (final c in seed.codeUnits) {
    h = (h * 31 + c) & 0x7fffffff;
  }
  return presetAvatars[h % presetAvatars.length].id;
}

String _scenePaths(String key, AvatarPalette p) {
  final ink = p.ink, light = p.light, sun = p.sun, accent = p.accent, hill = p.hill;
  switch (key) {
    case 'dove':
      return '<g>'
          '<ellipse cx="31" cy="35" rx="9" ry="5.5" fill="$light"/>'
          '<path d="M31 31c5-4.5 10.5-4.5 15-1.5-4 0-7 2-9.2 5.4z" fill="$accent"/>'
          '<path d="M22 35l-7.5-2.4 6.5 4.6z" fill="$light"/>'
          '<circle cx="38" cy="33" r="1.1" fill="$ink"/>'
          '<path d="M41 34l3.4 1-3.4 1z" fill="$sun"/>'
          '</g>';
    case 'olive':
      return '<g>'
          '<path d="M17 47C28 41 39 31 47 18" stroke="$ink" stroke-width="2" fill="none" stroke-linecap="round"/>'
          '<g fill="$accent">'
          '<ellipse cx="26" cy="39" rx="4.2" ry="2.2" transform="rotate(-35 26 39)"/>'
          '<ellipse cx="34" cy="31" rx="4.2" ry="2.2" transform="rotate(-35 34 31)"/>'
          '<ellipse cx="41" cy="23" rx="4.2" ry="2.2" transform="rotate(-35 41 23)"/>'
          '</g>'
          '<circle cx="31" cy="41" r="2.4" fill="$sun"/>'
          '<circle cx="39" cy="33" r="2.4" fill="$sun"/>'
          '</g>';
    case 'mountain':
      return '<g>'
          '<circle cx="32" cy="27" r="6.5" fill="$sun"/>'
          '<path d="M12 48l11-17 7 10 5-7 13 14z" fill="$ink" opacity="0.85"/>'
          '<path d="M21 31l2 3 2-3 2 3" stroke="$light" stroke-width="1.2" fill="none" opacity="0.7"/>'
          '</g>';
    case 'anchor':
      return '<g stroke="$light" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round">'
          '<circle cx="32" cy="22" r="2.6"/>'
          '<path d="M32 24.5v18"/>'
          '<path d="M24 30h16"/>'
          '<path d="M22 36c0 6.5 5 9.5 10 9.5s10-3 10-9.5"/>'
          '</g>';
    case 'candle':
      return '<g>'
          '<ellipse cx="32" cy="25" rx="7" ry="7" fill="$sun" opacity="0.25"/>'
          '<path d="M32 19c2.1 2.1 3.1 3.7 3.1 5.4a3.1 3.1 0 0 1-6.2 0c0-1.7 1-3.3 3.1-5.4z" fill="$sun"/>'
          '<rect x="28" y="29" width="8" height="17" rx="2.5" fill="$light"/>'
          '<path d="M32 29v-2.4" stroke="$ink" stroke-width="1.4"/>'
          '</g>';
    case 'book':
      return '<g>'
          '<path d="M14 29c6-2.2 12-2.2 18 1 6-3.2 12-3.2 18-1v16c-6-2.2-12-2.2-18 1-6-3.2-12-3.2-18-1z" fill="$light"/>'
          '<path d="M32 30v16" stroke="${p.sky2}" stroke-width="1.3"/>'
          '<path d="M32 20l6 9H26z" fill="$sun" opacity="0.55"/>'
          '<path d="M19 33c3-1 6-1 9 0M36 33c3-1 6-1 9 0" stroke="${p.sky2}" stroke-width="1" opacity="0.5"/>'
          '</g>';
    case 'vine':
      return '<g>'
          '<path d="M23 19c0 6.5 4 9 9 9s9-2.5 9-9" stroke="$ink" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
          '<g fill="$accent">'
          '<circle cx="28" cy="30" r="3"/><circle cx="36" cy="30" r="3"/><circle cx="32" cy="30" r="3"/>'
          '<circle cx="30" cy="35" r="3"/><circle cx="34" cy="35" r="3"/>'
          '<circle cx="32" cy="40" r="3"/>'
          '</g>'
          '<path d="M22 21c3-2.5 6.5-2.5 9 0" stroke="$hill" stroke-width="2" fill="none" stroke-linecap="round"/>'
          '</g>';
    case 'starnight':
      return '<g>'
          '<path d="M41 30a9.5 9.5 0 1 1-9.5-9.5A7.4 7.4 0 0 0 41 30z" fill="$sun"/>'
          '<g fill="$light">'
          '<path d="M20 26l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'
          '<path d="M26 41l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6z"/>'
          '<circle cx="43" cy="42" r="1"/>'
          '</g>'
          '</g>';
    case 'wheat':
      return '<g>'
          '<path d="M32 46V25" stroke="$ink" stroke-width="1.6" stroke-linecap="round"/>'
          '<g fill="$sun">'
          '<ellipse cx="32" cy="24" rx="2" ry="3.4"/>'
          '<ellipse cx="28" cy="29" rx="1.8" ry="3" transform="rotate(28 28 29)"/>'
          '<ellipse cx="36" cy="29" rx="1.8" ry="3" transform="rotate(-28 36 29)"/>'
          '<ellipse cx="28" cy="34" rx="1.8" ry="3" transform="rotate(28 28 34)"/>'
          '<ellipse cx="36" cy="34" rx="1.8" ry="3" transform="rotate(-28 36 34)"/>'
          '</g>'
          '</g>';
    case 'lily':
    default:
      return '<g>'
          '<path d="M32 44V32" stroke="$hill" stroke-width="2" stroke-linecap="round"/>'
          '<g fill="$light">'
          '<ellipse cx="32" cy="26" rx="3" ry="8"/>'
          '<ellipse cx="32" cy="26" rx="8" ry="3"/>'
          '<ellipse cx="32" cy="26" rx="3" ry="8" transform="rotate(45 32 26)"/>'
          '<ellipse cx="32" cy="26" rx="3" ry="8" transform="rotate(-45 32 26)"/>'
          '</g>'
          '<circle cx="32" cy="26" r="2.4" fill="$sun"/>'
          '</g>';
  }
}

String _avatarSvg(PresetAvatar a) {
  final p = avatarPalettes[a.palette % avatarPalettes.length];
  final sc = avatarScenes[a.scene % avatarScenes.length];
  final uid = a.id;
  return '<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">'
      '<defs>'
      '<clipPath id="clip-$uid"><circle cx="32" cy="32" r="32"/></clipPath>'
      '<linearGradient id="sky-$uid" x1="0" y1="0" x2="0" y2="1">'
      '<stop offset="0%" stop-color="${p.sky1}"/>'
      '<stop offset="100%" stop-color="${p.sky2}"/>'
      '</linearGradient>'
      '</defs>'
      '<g clip-path="url(#clip-$uid)">'
      '<rect width="64" height="64" fill="url(#sky-$uid)"/>'
      '<path d="M-2 50c12-9 26-9 34-3.5 10 6.5 22 6.5 34 1V66H-2z" fill="${p.hill}" opacity="0.92"/>'
      '${_scenePaths(sc.key, p)}'
      '</g>'
      '<circle cx="32" cy="32" r="31" fill="none" stroke="rgba(0,0,0,0.10)" stroke-width="2"/>'
      '</svg>';
}

class AvatarBubble extends StatelessWidget {
  const AvatarBubble({super.key, required this.id, this.size = 48});
  final String id;
  final double size;

  @override
  Widget build(BuildContext context) {
    final a = presetAvatars.firstWhere(
      (x) => x.id == id,
      orElse: () => presetAvatars.first,
    );
    return SvgPicture.string(
      _avatarSvg(a),
      width: size,
      height: size,
    );
  }
}
