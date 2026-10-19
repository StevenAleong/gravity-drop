import type { VisualStyle } from '../sim/types';

export const BG = 0x0a0c1a;
export const BG_BAND = 0x0f1226;

export const STYLE: Record<VisualStyle, { fill: number; edge: number; glow: number }> = {
  wall: { fill: 0x1d2547, edge: 0x6f8cff, glow: 0x4a66ff },
  peg: { fill: 0xd6e0ff, edge: 0xffffff, glow: 0x8fa8ff },
  bumper: { fill: 0xff3d8b, edge: 0xffd1e4, glow: 0xff3d8b },
  spinner: { fill: 0xffa53d, edge: 0xffe0b0, glow: 0xff8a00 },
  slider: { fill: 0x2fd6d9, edge: 0xc4ffff, glow: 0x00c8ff },
  trapdoor: { fill: 0xffcf3d, edge: 0xfff2b8, glow: 0xffb800 },
  flipper: { fill: 0xff5c5c, edge: 0xffd0d0, glow: 0xff2e2e },
  seesaw: { fill: 0xb17cff, edge: 0xe8d8ff, glow: 0x9a5cff },
  gate: { fill: 0x5dff9a, edge: 0xe0ffe9, glow: 0x00ff6a },
  sling: { fill: 0xff7a1a, edge: 0xffe1c4, glow: 0xff5a00 },
  tramp: { fill: 0xb6ff3d, edge: 0xf0ffd0, glow: 0x8cff00 },
  breakaway: { fill: 0xbfe9ff, edge: 0xffffff, glow: 0x6fd2ff },
  hinge: { fill: 0x2a2f4a, edge: 0xffffff, glow: 0xffffff },
  rod: { fill: 0x8a93b8, edge: 0xe4e8ff, glow: 0xb8c2ff },
  toggle: { fill: 0x3dffd2, edge: 0xd0fff4, glow: 0x00ffc0 },
  foosBlack: { fill: 0x1a1a20, edge: 0xc8ccdc, glow: 0xffffff },
  foosYellow: { fill: 0xffd21a, edge: 0xfff6c0, glow: 0xffc400 },
};

export const FAN = 0x7fdbff;
export const HELP = 0x5dff9a;
export const HURT = 0xff5d6c;
export const PORTAL_FWD = 0x3cf0ff;
export const PORTAL_BACK = 0xff4fd8;
export const BLACKHOLE = 0xff7a3d;
export const LIFT = 0xffcf3d;
export const BOOST = 0xfff36b;
export const HAZARD = 0xffc21a;
export const STEEL = 0x8a93b8;
export const SKY = 0xbfe6ff;
export const MINE = 0xff4d2e;
export const MINE_HOT = 0xffc23d;
