import { Graphics } from 'pixi.js';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
  size: number;
  grav: number;
}

interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  max: number;
  color: number;
}

/** World-space effects: sparks and rings. Everything redraws into one Graphics each frame. */
export class Fx {
  readonly g = new Graphics();
  private parts: Particle[] = [];
  private rings: Ring[] = [];

  clear() {
    this.parts.length = 0;
    this.rings.length = 0;
    this.g.clear();
  }

  burst(x: number, y: number, color: number, n: number, speed: number, size = 0.08, grav = 6) {
    if (this.parts.length > 1500) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      const max = 0.35 + Math.random() * 0.45;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: max, max, color, size, grav });
    }
  }

  ring(x: number, y: number, color: number, r0: number, r1: number, dur = 0.5) {
    this.rings.push({ x, y, r0, r1, life: dur, max: dur, color });
  }

  update(dt: number) {
    const g = this.g;
    g.clear();

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      const k = 1 - r.life / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k));
      g.circle(r.x, r.y, rad).stroke({ width: 0.12 * (1 - k) + 0.02, color: r.color, alpha: 1 - k });
    }

    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts[i] = this.parts[this.parts.length - 1];
        this.parts.pop();
        continue;
      }
      p.vy += p.grav * dt;
      p.vx *= 0.98;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = p.life / p.max;
      g.circle(p.x, p.y, p.size * (0.4 + a * 0.6)).fill({ color: p.color, alpha: a });
    }
  }
}

interface Flake {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: number;
  life: number;
}

/** Screen-space confetti for the winner reveal. */
export class Confetti {
  readonly g = new Graphics();
  private flakes: Flake[] = [];

  clear() {
    this.flakes.length = 0;
    this.g.clear();
  }

  launch(width: number, height: number, colors: number[]) {
    for (let i = 0; i < 260; i++) {
      const fromLeft = i % 2 === 0;
      this.flakes.push({
        x: fromLeft ? -10 : width + 10,
        y: height * (0.55 + Math.random() * 0.4),
        vx: (fromLeft ? 1 : -1) * (300 + Math.random() * 700),
        vy: -(500 + Math.random() * 900),
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 14,
        w: 6 + Math.random() * 8,
        h: 4 + Math.random() * 6,
        color: colors[i % colors.length],
        life: 4 + Math.random() * 2,
      });
    }
  }

  update(dt: number) {
    const g = this.g;
    g.clear();
    for (let i = this.flakes.length - 1; i >= 0; i--) {
      const f = this.flakes[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.flakes.splice(i, 1);
        continue;
      }
      f.vy += 900 * dt;
      f.vx *= 0.985;
      f.vy *= 0.985;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.vr * dt;
      // Fake 3D flutter by squashing one axis.
      const c = Math.cos(f.rot);
      const s = Math.sin(f.rot);
      const hw = (f.w / 2) * Math.abs(Math.cos(f.rot * 1.7));
      const hh = f.h / 2;
      g.poly([
        f.x + c * -hw - s * -hh, f.y + s * -hw + c * -hh,
        f.x + c * hw - s * -hh, f.y + s * hw + c * -hh,
        f.x + c * hw - s * hh, f.y + s * hw + c * hh,
        f.x + c * -hw - s * hh, f.y + s * -hw + c * hh,
      ]).fill({ color: f.color, alpha: Math.min(1, f.life) });
    }
  }
}
