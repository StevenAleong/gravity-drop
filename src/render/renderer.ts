import { Application, Container, Graphics, Text } from 'pixi.js';
import { LIFT_SPEED, MARBLE_R, W } from '../sim/constants';
import type { Marble, Sim } from '../sim/sim';
import type { SimEvent, Visual } from '../sim/types';
import type { BoosterZone, ConveyorZone, FanZone, LiftZone, PortalZone, StamperZone, Zone } from '../sim/zones';
import { Confetti, Fx } from './fx';
import { BG, BG_BAND, BOOST, FAN, HAZARD, HELP, HURT, LIFT, PORTAL_BACK, PORTAL_FWD, STEEL, STYLE } from './palette';

interface MarbleView {
  m: Marble;
  root: Container;
  spin: Graphics;
  label: Text;
  labelKey: string;
  trail: number[];
}

interface DynView {
  v: Visual;
  g: Graphics;
}

interface ZoneView {
  z: Zone;
  g: Graphics;
  anim: number;
}

export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Camera for a section preview: `y` is the centre of the view, and `auto` pans it up and down on its own. */
export interface PreviewCam {
  y: number;
  auto: boolean;
  dir: 1 | -1;
  /** Seconds left to pause at the top or bottom before panning back. */
  hold: number;
}

/** A preview shows at most this many metres of height before it scrolls (so pegs stay readable). */
const PREVIEW_MAX_H = 30;
/** Auto-pan speed (m/s) for previews taller than the view. */
const PREVIEW_PAN = 3;

const darken = (c: number, k: number) =>
  (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);

/** Draws a neon tube between two points (used for walls and capsule obstacles). */
function tube(g: Graphics, ax: number, ay: number, bx: number, by: number, r: number, style: keyof typeof STYLE) {
  const s = STYLE[style];
  g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: r * 2 + 0.26, color: s.glow, alpha: 0.14, cap: 'round' });
  g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: r * 2, color: s.fill, cap: 'round' });
  g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: Math.min(0.06, r * 0.5), color: s.edge, alpha: 0.85, cap: 'round' });
}

function chevron(g: Graphics, x: number, y: number, dx: number, dy: number, size: number) {
  // Arrowhead pointing along (dx, dy).
  const px = -dy;
  const py = dx;
  g.moveTo(x - dx * size + px * size, y - dy * size + py * size)
    .lineTo(x, y)
    .lineTo(x - dx * size - px * size, y - dy * size - py * size);
}

export class Renderer {
  readonly world = new Container();
  private overlay = new Container();
  private bg = new Graphics();
  private zoneLayer = new Container();
  private staticG = new Graphics();
  private dynLayer = new Container();
  private hingeG = new Graphics();
  private trailG = new Graphics();
  private marbleLayer = new Container();
  private marbleFxG = new Graphics();
  private labelLayer = new Container();
  private textLayer = new Container();
  readonly fx = new Fx();
  readonly confetti = new Confetti();

  private sim: Sim | null = null;
  private marbles: MarbleView[] = [];
  private dyn: DynView[] = [];
  private zones: ZoneView[] = [];
  private bumpers = new Map<number, { g: Graphics; pulse: number }>();
  private slings = new Map<number, { glow: Graphics; pulse: number }>();
  /** Glass platforms by visual id. `fade` runs from 1 down to 0 once one breaks (-1 while intact). */
  private glass = new Map<number, { g: Graphics; fade: number }>();
  private gateG: Graphics | null = null;

  insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 };
  /** Set while previewing a single section: frames it instead of following marbles. */
  preview: PreviewCam | null = null;
  /** True when the previewed section is taller than the view, so it can be scrolled. */
  previewScrolls = false;
  scale = 40;
  zoom = 1;
  camX = W / 2;
  camY = 0;
  private shake = 0;
  private time = 0;

  constructor(private app: Application) {
    app.renderer.background.color = BG;
    this.world.addChild(
      this.bg,
      this.textLayer,
      this.staticG,
      this.zoneLayer,
      this.dynLayer,
      this.hingeG,
      this.trailG,
      this.marbleLayer,
      this.marbleFxG,
      this.fx.g,
    );
    this.overlay.addChild(this.labelLayer, this.confetti.g);
    app.stage.addChild(this.world, this.overlay);
  }

  // ---- build ----------------------------------------------------------------

  build(sim: Sim) {
    this.teardown();
    this.sim = sim;

    this.drawBackdrop(sim);
    for (const v of sim.visuals) this.addVisual(v);
    for (const z of sim.zones) {
      const g = new Graphics();
      this.zoneLayer.addChild(g);
      this.zones.push({ z, g, anim: 0 });
    }
    for (const h of sim.hinges) {
      this.hingeG.circle(h.x, h.y, 0.2).fill(STYLE.hinge.fill).stroke({ width: 0.05, color: STYLE.hinge.edge, alpha: 0.7 });
    }
    this.drawFinish(sim);

    for (const m of sim.marbles) this.addMarble(m);

    this.camY = sim.gateY - 1;
    this.camX = W / 2;
    this.zoom = 1;
  }

  private teardown() {
    for (const layer of [this.zoneLayer, this.dynLayer, this.marbleLayer, this.labelLayer, this.textLayer]) {
      for (const c of layer.removeChildren()) c.destroy({ children: true });
    }
    this.bg.clear();
    this.staticG.clear();
    this.hingeG.clear();
    this.trailG.clear();
    this.marbleFxG.clear();
    this.fx.clear();
    this.confetti.clear();
    this.marbles = [];
    this.dyn = [];
    this.zones = [];
    this.bumpers.clear();
    this.slings.clear();
    this.glass.clear();
    this.gateG = null;
  }

  private drawBackdrop(sim: Sim) {
    const g = this.bg;
    g.rect(0, sim.topY, W, sim.bottomY - sim.topY).fill(BG_BAND);
    sim.segments.forEach((s, i) => {
      g.rect(0, s.y0, W, s.h).fill({ color: i % 2 ? 0x12163a : 0x0d1030, alpha: 1 });
      g.moveTo(0, s.y0).lineTo(W, s.y0).stroke({ width: 0.03, color: 0x6f8cff, alpha: 0.18 });
      const t = new Text({
        text: s.name,
        style: { fontFamily: 'Bungee, Impact, sans-serif', fontSize: 110, fill: 0xffffff, letterSpacing: 6 },
      });
      t.alpha = 0.07;
      t.anchor.set(0.5, 0);
      t.scale.set(0.0075);
      t.position.set(W / 2, s.y0 + 0.25);
      this.textLayer.addChild(t);
    });
    // Faint dot grid for a sense of speed.
    for (let y = Math.ceil(sim.topY); y < sim.bottomY; y += 1) {
      for (let x = 0.5; x < W; x += 1) g.rect(x - 0.015, y - 0.015, 0.03, 0.03).fill({ color: 0xffffff, alpha: 0.05 });
    }
  }

  private drawFinish(sim: Sim) {
    if (!Number.isFinite(sim.finishY)) return; // a section preview without a finish line
    const g = this.staticG;
    const sq = 0.4;
    for (let i = 0; i * sq < W; i++) {
      for (let j = 0; j < 2; j++) {
        g.rect(i * sq, sim.finishY - sq + j * sq, sq, sq).fill({ color: (i + j) % 2 ? 0xffffff : 0x111111, alpha: 0.55 });
      }
    }
    const t = new Text({ text: 'FINISH', style: { fontFamily: 'Bungee, Impact, sans-serif', fontSize: 110, fill: 0xffffff } });
    t.anchor.set(0.5, 0);
    t.scale.set(0.007);
    t.alpha = 0.25;
    t.position.set(W / 2, sim.finishY + 0.3);
    this.textLayer.addChild(t);
  }

  private addVisual(v: Visual) {
    const { collider, shape, style } = v;
    const p = collider.translation();
    const rot = collider.rotation();

    if (!v.dynamic && (style === 'wall' || style === 'peg')) {
      const g = this.staticG;
      if (shape.kind === 'capsule') {
        const dx = -Math.sin(rot) * shape.hh;
        const dy = Math.cos(rot) * shape.hh;
        tube(g, p.x - dx, p.y - dy, p.x + dx, p.y + dy, shape.r, style);
      } else {
        const s = STYLE[style];
        g.circle(p.x, p.y, shape.r + 0.1).fill({ color: s.glow, alpha: 0.16 });
        g.circle(p.x, p.y, shape.r).fill(s.fill);
        g.circle(p.x - shape.r * 0.3, p.y - shape.r * 0.3, shape.r * 0.35).fill({ color: 0xffffff, alpha: 0.8 });
      }
      return;
    }

    const g = new Graphics();
    if (shape.kind === 'capsule') {
      tube(g, 0, -shape.hh, 0, shape.hh, shape.r, style);
      if (style === 'sling' || style === 'tramp') {
        // White-hot overlay that flashes when the kicker fires or the pad springs.
        const glow = new Graphics();
        glow.moveTo(0, -shape.hh).lineTo(0, shape.hh).stroke({ width: shape.r * 2 + 0.3, color: 0xffffff, cap: 'round' });
        glow.alpha = 0;
        g.addChild(glow);
        this.slings.set(v.id, { glow, pulse: 0 });
      }
      if (style === 'breakaway') {
        // Glints across the pane so it reads as glass rather than a wall.
        for (let y = -shape.hh + 0.35; y < shape.hh - 0.2; y += 0.7) {
          g.moveTo(-shape.r * 0.7, y - 0.1).lineTo(shape.r * 0.7, y + 0.1).stroke({ width: 0.04, color: 0xffffff, alpha: 0.7 });
        }
        this.glass.set(v.id, { g, fade: -1 });
      }
    } else if (style === 'bumper') {
      const s = STYLE.bumper;
      g.circle(0, 0, shape.r + 0.18).fill({ color: s.glow, alpha: 0.18 });
      g.circle(0, 0, shape.r).fill(s.fill).stroke({ width: 0.07, color: s.edge });
      g.circle(0, 0, shape.r * 0.55).stroke({ width: 0.05, color: 0xffffff, alpha: 0.6 });
      g.circle(-shape.r * 0.3, -shape.r * 0.35, shape.r * 0.18).fill({ color: 0xffffff, alpha: 0.7 });
      this.bumpers.set(v.id, { g, pulse: 0 });
    } else {
      g.circle(0, 0, shape.r).fill(STYLE[style].fill);
    }
    g.position.set(p.x, p.y);
    g.rotation = rot;
    this.dynLayer.addChild(g);
    if (style === 'gate') this.gateG = g;
    if (v.dynamic) this.dyn.push({ v, g });
  }

  private addMarble(m: Marble) {
    const root = new Container();
    const base = new Graphics();
    base.circle(0, 0, MARBLE_R * 1.7).fill({ color: m.color, alpha: 0.13 });
    base.circle(0, 0, MARBLE_R).fill(m.color).stroke({ width: 0.04, color: darken(m.color, 0.45) });
    const spin = new Graphics();
    // A swirl band so you can see the marble rolling.
    spin.moveTo(-MARBLE_R * 0.85, -MARBLE_R * 0.15)
      .bezierCurveTo(-MARBLE_R * 0.2, MARBLE_R * 0.45, MARBLE_R * 0.2, -MARBLE_R * 0.45, MARBLE_R * 0.85, MARBLE_R * 0.15)
      .stroke({ width: 0.07, color: 0xffffff, alpha: 0.45, cap: 'round' });
    const shine = new Graphics();
    shine.circle(-MARBLE_R * 0.35, -MARBLE_R * 0.38, MARBLE_R * 0.28).fill({ color: 0xffffff, alpha: 0.55 });
    root.addChild(base, spin, shine);
    this.marbleLayer.addChild(root);

    const label = new Text({
      text: m.name,
      style: {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 13,
        fontWeight: '700',
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 3 },
      },
      resolution: Math.min(2, window.devicePixelRatio || 1) * 1.5,
    });
    label.anchor.set(0.5, 1);
    this.labelLayer.addChild(label);
    this.marbles.push({ m, root, spin, label, labelKey: '', trail: [] });
  }

  // ---- events ---------------------------------------------------------------

  onEvent(e: SimEvent) {
    const sim = this.sim;
    if (!sim) return;
    const color = (i: number) => sim.marbles[i].color;
    switch (e.type) {
      case 'gate':
        if (this.gateG) this.gateG.visible = false;
        for (let x = 0.5; x < W; x += 0.5) this.fx.burst(x, sim.gateY, STYLE.gate.glow, 2, 4);
        break;
      case 'hit':
        if (e.speed > 7) this.fx.burst(e.x, e.y, 0xffffff, 2, 2.5, 0.05);
        break;
      case 'bumper': {
        const b = this.bumpers.get(e.visual);
        if (b) b.pulse = 1;
        this.fx.burst(e.x, e.y, STYLE.bumper.glow, 10, 6);
        this.addShake(0.12);
        break;
      }
      case 'sling': {
        const sl = this.slings.get(e.visual);
        if (sl) sl.pulse = 1;
        this.fx.burst(e.x, e.y, STYLE.sling.glow, 12, 6);
        this.addShake(0.1);
        break;
      }
      case 'tramp': {
        const tp = this.slings.get(e.visual);
        if (tp) tp.pulse = 1;
        this.fx.burst(e.x, e.y, STYLE.tramp.glow, 8, 4);
        break;
      }
      case 'shatter': {
        const gl = this.glass.get(e.visual);
        if (gl) gl.fade = 1;
        // Shards all along the pane, plus a white flash where the marble hit.
        for (let x = e.x1 + 0.3; x < e.x2; x += 0.6) this.fx.burst(x, e.y, STYLE.breakaway.glow, 3, 3.5, 0.07, 14);
        this.fx.burst(e.x, e.y, 0xffffff, 14, 6, 0.06, 10);
        this.addShake(0.15);
        break;
      }
      case 'warp':
        this.fx.burst(e.fromX, e.fromY, 0xc78bff, 16, 4, 0.08, -2);
        this.fx.ring(e.x, e.y, 0xc78bff, 2, 0.3, 0.5);
        this.fx.burst(e.x, e.y, 0xffffff, 12, 3, 0.06, -1);
        break;
      case 'portal': {
        const c = e.forward ? PORTAL_FWD : PORTAL_BACK;
        this.fx.ring(e.fromX, e.fromY, c, 0.2, 1.4, 0.4);
        this.fx.ring(e.x, e.y, c, 1.4, 0.2, 0.4);
        this.fx.burst(e.x, e.y, c, 12, 4, 0.07, 0);
        break;
      }
      case 'lift':
        this.fx.burst(e.x, e.y, LIFT, 10, 3, 0.07, -3);
        break;
      case 'boost':
        this.fx.burst(e.x, e.y, BOOST, 12, 5, 0.07, 0);
        break;
      case 'stamp':
        this.fx.burst(e.x, e.y, STEEL, 8, 3, 0.06, 2);
        this.addShake(0.08);
        break;
      case 'stamped':
        this.fx.burst(e.x, e.y, e.forward ? HELP : HURT, 14, 6, 0.08, 0);
        this.fx.ring(e.x, e.y, HAZARD, 0.2, 1.3, 0.35);
        break;
      case 'finish':
        this.fx.burst(sim.marbles[e.marble].x, sim.finishY, color(e.marble), 26, 8);
        this.fx.ring(sim.marbles[e.marble].x, sim.finishY, color(e.marble), 0.3, 2.5, 0.7);
        break;
      case 'winner':
        this.confetti.launch(this.app.screen.width, this.app.screen.height, [color(e.marble), 0xffffff, 0xffd34d, 0x5dff9a, 0x3cf0ff, 0xff4fd8]);
        this.addShake(0.5);
        break;
    }
  }

  addShake(amount: number) {
    this.shake = Math.min(1, this.shake + amount);
  }

  // ---- per-frame ------------------------------------------------------------

  update(dt: number, target: Marble | null, zoomTarget: number, leaderIdx: number, followIdx: number | null) {
    const sim = this.sim;
    if (!sim) return;
    this.time += dt;
    this.updateCamera(dt, sim, target, zoomTarget);

    const s = this.scale;
    const yTop = -this.world.y / s - 2;
    const yBot = (this.app.screen.height - this.world.y) / s + 2;

    for (const d of this.dyn) {
      const p = d.v.collider.translation();
      d.g.position.set(p.x, p.y);
      d.g.rotation = d.v.collider.rotation();
    }
    for (const sl of this.slings.values()) {
      sl.pulse *= Math.exp(-dt * 10);
      sl.glow.alpha = sl.pulse * 0.8;
    }
    for (const gl of this.glass.values()) {
      if (gl.fade < 0 || !gl.g.visible) continue;
      gl.fade = Math.max(0, gl.fade - dt * 3);
      // Flashes white, then thins out and fades away.
      gl.g.alpha = gl.fade;
      gl.g.scale.x = 0.3 + gl.fade * 0.7;
      gl.g.tint = gl.fade > 0.75 ? 0xffffff : 0xb0d8ff;
      gl.g.visible = gl.fade > 0;
    }
    for (const b of this.bumpers.values()) {
      b.pulse *= Math.exp(-dt * 8);
      b.g.scale.set(1 + b.pulse * 0.3);
    }
    for (const zv of this.zones) {
      const visible = zv.z.maxY + 2 > yTop && zv.z.minY - 4 < yBot;
      zv.g.visible = visible;
      if (visible) this.drawZone(zv, dt);
    }

    this.updateMarbles(sim, leaderIdx, followIdx);
    this.fx.update(dt);
    this.confetti.update(dt);
  }

  private updateCamera(dt: number, sim: Sim, target: Marble | null, zoomTarget: number) {
    const scr = this.app.screen;
    const { left, right, top, bottom } = this.insets;
    const viewW = Math.max(100, scr.width - left - right);
    const viewH = Math.max(100, scr.height - top - bottom);
    if (this.preview) return this.previewCamera(dt, sim, this.preview, left, top, viewW, viewH);
    const base = Math.min(viewW / (W + 1.0), viewH / 11);

    this.zoom += (zoomTarget - this.zoom) * (1 - Math.exp(-dt * 3));
    const s = base * this.zoom;
    this.scale = s;

    const ty = target ? target.y : sim.gateY - 1;
    this.camY += (ty - this.camY) * (1 - Math.exp(-dt * 5));
    const anchor = 0.42;
    const maxCam = sim.bottomY + 0.5 - (viewH * (1 - anchor)) / s;
    const minCam = sim.topY + (viewH * anchor) / s;
    const camY = Math.max(minCam, Math.min(maxCam, this.camY));

    const tx = target && this.zoom > 1.02 ? target.x : W / 2;
    this.camX += (tx - this.camX) * (1 - Math.exp(-dt * 4));
    const half = viewW / 2 / s;
    const camX = half * 2 >= W + 1 ? W / 2 : Math.max(half - 0.5, Math.min(W + 0.5 - half, this.camX));

    this.shake *= Math.exp(-dt * 6);
    const sh = this.shake * s * 0.25;
    this.world.scale.set(s);
    this.world.position.set(
      left + viewW / 2 - camX * s + (Math.random() - 0.5) * sh,
      top + viewH * anchor - camY * s + (Math.random() - 0.5) * sh,
    );
  }

  /** Fits the whole section in view, or pans slowly up and down it (unless the player is scrolling). */
  private previewCamera(dt: number, sim: Sim, p: PreviewCam, left: number, top: number, viewW: number, viewH: number) {
    const total = sim.bottomY - sim.topY;
    const s = Math.min(viewW / (W + 1.0), Math.max(viewH / (total + 0.6), viewH / PREVIEW_MAX_H));
    this.scale = s;
    this.zoom = 1;
    const half = viewH / 2 / s;
    const lo = sim.topY - 0.3 + half;
    const hi = sim.bottomY + 0.3 - half;
    this.previewScrolls = hi > lo;
    if (!this.previewScrolls) {
      p.y = (sim.topY + sim.bottomY) / 2;
    } else {
      if (p.auto && (p.hold -= dt) <= 0) {
        p.y += p.dir * PREVIEW_PAN * dt;
        if ((p.dir > 0 && p.y >= hi) || (p.dir < 0 && p.y <= lo)) {
          p.dir = p.dir > 0 ? -1 : 1;
          p.hold = 1.5;
        }
      }
      p.y = Math.max(lo, Math.min(hi, p.y));
    }
    this.world.scale.set(s);
    this.world.position.set(left + viewW / 2 - (W / 2) * s, top + viewH / 2 - p.y * s);
  }

  private updateMarbles(sim: Sim, leaderIdx: number, followIdx: number | null) {
    const s = this.scale;
    const wx = this.world.x;
    const wy = this.world.y;
    const trail = this.trailG;
    const mfx = this.marbleFxG;
    trail.clear();
    mfx.clear();

    for (const mv of this.marbles) {
      const m = mv.m;
      mv.root.position.set(m.x, m.y);
      mv.spin.rotation = m.angle;
      mv.root.alpha = m.ghost ? 0.75 : 1;

      // Trail
      const tr = mv.trail;
      const lx = tr[tr.length - 2];
      const ly = tr[tr.length - 1];
      if (lx === undefined || Math.hypot(m.x - lx, m.y - ly) > 0.08) {
        tr.push(m.x, m.y);
        if (tr.length > 24) tr.splice(0, 2);
      }
      if (tr.length >= 4 && !m.finished) {
        trail.moveTo(tr[0], tr[1]);
        for (let i = 2; i < tr.length; i += 2) trail.lineTo(tr[i], tr[i + 1]);
        trail.stroke({ width: MARBLE_R * 1.1, color: m.color, alpha: 0.22, cap: 'round', join: 'round' });
      }

      // Status rings
      if (m.ghost) mfx.circle(m.x, m.y, MARBLE_R + 0.12).stroke({ width: 0.07, color: LIFT, alpha: 0.9 });
      if (m.idx === followIdx) {
        const r = MARBLE_R + 0.25 + Math.sin(this.time * 6) * 0.05;
        mfx.circle(m.x, m.y, r).stroke({ width: 0.05, color: 0xffffff, alpha: 0.8 });
      }
      if (sim.winner === m) {
        mfx.circle(m.x, m.y, MARBLE_R + 0.35 + Math.sin(this.time * 5) * 0.08).stroke({ width: 0.08, color: 0xffd34d });
      }

      // Label (screen space for crisp text)
      const crown = sim.winner === m || (m.idx === leaderIdx && !sim.winner && sim.opts.mode === 'first');
      const key = (crown ? '👑 ' : '') + m.name;
      if (key !== mv.labelKey) {
        mv.label.text = key;
        mv.labelKey = key;
      }
      mv.label.position.set(wx + m.x * s, wy + (m.y - MARBLE_R) * s - 3);
      mv.label.style.fill = m.idx === followIdx ? 0xffe066 : 0xffffff;
      mv.label.alpha = m.finished && sim.winner !== m ? 0.45 : 1;
    }
  }

  // ---- zones ----------------------------------------------------------------

  private drawZone(zv: ZoneView, dt: number) {
    const g = zv.g;
    g.clear();
    switch (zv.z.kind) {
      case 'fan':
        if (zv.z.retired(this.sim!.t)) return;
        return this.drawFan(g, zv.z, (zv.anim += dt * (0.2 + zv.z.level * 2.5)));
      case 'conveyor':
        return this.drawConveyor(g, zv.z, (zv.anim += dt * zv.z.beltVel));
      case 'lift':
        return this.drawLift(g, zv.z, (zv.anim += dt * LIFT_SPEED));
      case 'booster':
        return this.drawBooster(g, zv.z, (zv.anim += dt));
      case 'portal':
        return this.drawPortal(g, zv.z, (zv.anim += dt));
      case 'stamper':
        return this.drawStamper(g, zv.z);
    }
  }

  private drawFan(g: Graphics, z: FanZone, anim: number) {
    const lv = z.level;
    g.rect(z.x, z.y, z.w, z.h).fill({ color: FAN, alpha: 0.02 + 0.06 * lv });
    const horiz = Math.abs(z.dx) >= Math.abs(z.dy);
    const L = horiz ? z.w : z.h;
    const n = Math.min(26, Math.round((z.w * z.h) / 1.1));
    for (let i = 0; i < n; i++) {
      const lane = (i * 0.618) % 1;
      const along = (((i * 0.37 + anim / L) % 1) + 1) % 1;
      const a = lv * 0.55 * Math.sin(along * Math.PI);
      if (a < 0.02) continue;
      let px: number;
      let py: number;
      if (horiz) {
        px = z.dx > 0 ? z.x + along * L : z.x + z.w - along * L;
        py = z.y + 0.2 + lane * (z.h - 0.4);
      } else {
        py = z.dy < 0 ? z.y + z.h - along * L : z.y + along * L;
        px = z.x + 0.2 + lane * (z.w - 0.4);
      }
      g.moveTo(px, py).lineTo(px + z.dx * 0.9, py + z.dy * 0.9).stroke({ width: 0.05, color: 0xffffff, alpha: a, cap: 'round' });
    }
    // Housing with spinning rotor on the upwind side.
    let hx: number;
    let hy: number;
    if (horiz) {
      hx = z.dx < 0 ? z.x + z.w : z.x;
      hy = z.y + z.h / 2;
      g.roundRect(hx - 0.18, z.y + 0.2, 0.36, z.h - 0.4, 0.12).fill(0x1d2547).stroke({ width: 0.04, color: FAN, alpha: 0.7 });
    } else {
      hx = z.x + z.w / 2;
      hy = z.dy < 0 ? z.y + z.h : z.y;
      g.roundRect(z.x + 0.2, hy - 0.18, z.w - 0.4, 0.36, 0.12).fill(0x1d2547).stroke({ width: 0.04, color: FAN, alpha: 0.7 });
    }
    g.circle(hx, hy, 0.48).fill(0x141a33).stroke({ width: 0.05, color: FAN, alpha: 0.5 + lv * 0.5 });
    const rot = anim * 4;
    for (let k = 0; k < 3; k++) {
      const a = rot + (k * Math.PI * 2) / 3;
      g.moveTo(hx, hy).lineTo(hx + Math.cos(a) * 0.4, hy + Math.sin(a) * 0.4).stroke({ width: 0.12, color: FAN, alpha: 0.5 + lv * 0.5, cap: 'round' });
    }
  }

  private drawConveyor(g: Graphics, z: ConveyorZone, anim: number) {
    g.position.set(z.x1, z.y1);
    g.rotation = Math.atan2(z.uy, z.ux);
    g.rect(0, -0.14, z.len, 0.28).fill(0x141a33);
    const v = z.beltVel;
    const helping = v * z.uy > 0;
    const color = helping ? HELP : HURT;
    const strength = Math.min(1, Math.abs(z.dir));
    const dir = Math.sign(v) || 1;
    const sp = 0.55;
    const off = ((anim % sp) + sp) % sp;
    for (let x = off; x < z.len - 0.05; x += sp) {
      if (x < 0.05) continue;
      chevron(g, x + dir * 0.07, 0, dir, 0, 0.09);
    }
    g.stroke({ width: 0.05, color, alpha: 0.35 + 0.6 * strength, cap: 'round', join: 'round' });
    g.rect(0, -0.14, z.len, 0.28).stroke({ width: 0.03, color, alpha: 0.4 });
    if (z.warnFor > 0) {
      // Rollers at each end; they blink amber before the belt reverses.
      const on = z.warning && Math.floor(this.time * 10) % 2 === 0;
      for (const x of [0, z.len]) {
        g.circle(x, 0, 0.2).fill(0x141a33).stroke({ width: 0.05, color: on ? HAZARD : color, alpha: on ? 1 : 0.5 });
        if (on) g.circle(x, 0, 0.42).fill({ color: HAZARD, alpha: 0.25 });
      }
    }
  }

  private drawStamper(g: Graphics, z: StamperZone) {
    // Local frame: x along the ramp, -y is "up" away from the ramp. Origin at the head centre.
    g.position.set(z.cx, z.cy);
    g.rotation = Math.atan2(z.uy, z.ux);
    const hl = z.len / 2 + z.headR;
    const hr = z.headR;
    const top = -(z.high - z.offset) - 0.9;
    const tint = z.forward ? HELP : HURT;
    // Rod and housing.
    g.rect(-0.08, top, 0.16, -top).fill(STEEL);
    g.roundRect(-0.55, top - 0.35, 1.1, 0.4, 0.08).fill(0x1d2547).stroke({ width: 0.04, color: STEEL });
    // Warning light on the housing.
    const blink = z.warning && Math.floor(this.time * 14) % 2 === 0;
    g.circle(0, top - 0.15, 0.12).fill(blink || z.flash > 0.3 ? HAZARD : 0x4a3a10);
    if (blink) g.circle(0, top - 0.15, 0.35).fill({ color: HAZARD, alpha: 0.3 });
    // Head with hazard stripes along its face.
    g.roundRect(-hl, -hr, hl * 2, hr * 2, hr * 0.6).fill(0x2a3150).stroke({ width: 0.05, color: tint, alpha: 0.6 + 0.4 * z.flash });
    for (let x = -hl + 0.25; x < hl - 0.2; x += 0.32) {
      g.moveTo(x, hr - 0.04).lineTo(x + 0.16, hr - 0.2).lineTo(x + 0.3, hr - 0.2).lineTo(x + 0.14, hr - 0.04).closePath().fill(HAZARD);
    }
    // Chevrons show which way it kicks.
    const dir = z.kickDir;
    for (const x of [-0.35, 0, 0.35]) chevron(g, x + dir * 0.08, -0.06, dir, 0, 0.09);
    g.stroke({ width: 0.05, color: tint, alpha: 0.9, cap: 'round', join: 'round' });
    if (z.flash > 0.05) g.roundRect(-hl, -hr, hl * 2, hr * 2, hr * 0.6).fill({ color: 0xffffff, alpha: 0.35 * z.flash });
  }

  private drawLift(g: Graphics, z: LiftZone, anim: number) {
    g.rect(z.x, z.y, z.w, z.h).fill({ color: LIFT, alpha: 0.08 }).stroke({ width: 0.04, color: LIFT, alpha: 0.5 });
    const y0 = z.y + z.h;
    const y1 = z.topY;
    g.moveTo(z.railX, y0).lineTo(z.railX, y1).stroke({ width: 0.34, color: 0x2a2410, cap: 'round' });
    const sp = 0.8;
    const off = anim % sp;
    for (let y = y0 - off; y > y1 + 0.2; y -= sp) chevron(g, z.railX, y, 0, -1, 0.12);
    g.stroke({ width: 0.06, color: LIFT, alpha: 0.85, cap: 'round', join: 'round' });
    chevron(g, z.railX - 0.5, y1, Math.sign(z.releaseVx), 0, 0.18);
    g.stroke({ width: 0.07, color: LIFT, cap: 'round', join: 'round' });
  }

  private drawBooster(g: Graphics, z: BoosterZone, anim: number) {
    const len = Math.hypot(z.vx, z.vy) || 1;
    const dx = z.vx / len;
    const dy = z.vy / len;
    const cx = z.x + z.w / 2;
    const cy = z.y + z.h / 2;
    g.roundRect(z.x, z.y, z.w, z.h, 0.12).fill({ color: BOOST, alpha: 0.1 + 0.5 * z.flash }).stroke({ width: 0.04, color: BOOST, alpha: 0.6 });
    for (let k = 0; k < 3; k++) {
      const t = ((anim * 2 + k / 3) % 1) - 0.5;
      chevron(g, cx + dx * t * 0.7, cy + dy * t * 0.7, dx, dy, 0.13);
      g.stroke({ width: 0.06, color: BOOST, alpha: 0.9 - Math.abs(t) * 1.2, cap: 'round', join: 'round' });
    }
  }

  private drawPortal(g: Graphics, z: PortalZone, anim: number) {
    const c = z.forward ? PORTAL_FWD : PORTAL_BACK;
    const glow = 0.15 + z.flash * 0.5;
    g.circle(z.ax, z.ay, z.r + 0.15).fill({ color: c, alpha: glow * 0.6 });
    g.circle(z.ax, z.ay, z.r).fill({ color: 0x05060f, alpha: 0.9 });
    for (let k = 0; k < 3; k++) {
      const a0 = anim * (z.forward ? 3 : -3) + (k * Math.PI * 2) / 3;
      const rr = z.r - 0.06 - k * 0.12;
      g.moveTo(z.ax + Math.cos(a0) * rr, z.ay + Math.sin(a0) * rr)
        .arc(z.ax, z.ay, rr, a0, a0 + 1.4)
        .stroke({ width: 0.07, color: c, alpha: 0.9 - k * 0.2, cap: 'round' });
    }
    chevron(g, z.ax, z.ay + (z.forward ? 0.12 : -0.12), 0, z.forward ? 1 : -1, 0.14);
    g.stroke({ width: 0.06, color: 0xffffff, alpha: 0.9, cap: 'round', join: 'round' });
    // Exit marker
    for (let k = 0; k < 6; k++) {
      const a0 = -anim + (k * Math.PI) / 3;
      g.moveTo(z.bx + Math.cos(a0) * 0.42, z.by + Math.sin(a0) * 0.42)
        .arc(z.bx, z.by, 0.42, a0, a0 + 0.5)
        .stroke({ width: 0.05, color: c, alpha: 0.35 + z.flash * 0.6 });
    }
  }

  // ---- helpers for main -----------------------------------------------------

  isVisible(y: number) {
    const s = this.scale;
    const top = -this.world.y / s;
    return y > top - 1 && y < top + this.app.screen.height / s + 1;
  }

  /** Screen x in [-1, 1] for stereo panning. */
  pan(x: number) {
    const sx = this.world.x + x * this.scale;
    return Math.max(-1, Math.min(1, (sx / this.app.screen.width) * 2 - 1));
  }
}
