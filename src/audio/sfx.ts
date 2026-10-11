import { COUNTDOWN } from '../sim/constants';

/** All sounds are synthesized with Web Audio, so there are no assets to load. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private tickBuf: AudioBuffer | null = null;
  private clackBuf: AudioBuffer | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private recent: number[] = [];
  enabled = true;

  /** Must be called from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.7;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.master.connect(comp).connect(ctx.destination);
      this.tickBuf = this.makeClick(ctx, 3200, 0.0035, 0.5);
      this.clackBuf = this.makeClick(ctx, 1400, 0.006, 0.35);
      this.noiseBuf = this.makeNoise(ctx, 1.5);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private makeClick(ctx: AudioContext, freq: number, decay: number, noiseAmt: number) {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 0.05);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.exp(-t / decay);
      d[i] = ((Math.random() * 2 - 1) * noiseAmt + Math.sin(2 * Math.PI * freq * t) * (1 - noiseAmt)) * env;
    }
    return buf;
  }

  private makeNoise(ctx: AudioContext, secs: number) {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * secs), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private ready() {
    return this.enabled && this.ctx && this.master && this.ctx.state === 'running';
  }

  /** Throttle for frequent sounds (peg ticks) so a pile-up doesn't become white noise. */
  private allow(maxPerSec: number) {
    const now = this.ctx!.currentTime;
    while (this.recent.length && now - this.recent[0] > 1) this.recent.shift();
    if (this.recent.length >= maxPerSec) return false;
    this.recent.push(now);
    return true;
  }

  private out(pan: number) {
    const ctx = this.ctx!;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan * 0.7));
    p.connect(this.master!);
    return p;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, pan = 0, delay = 0) {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out(pan));
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, filterFreq: number, pan = 0, q = 1) {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = filterFreq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out(pan));
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur);
  }

  /** Peg / wall / marble click. Pitch and volume follow impact speed. */
  hit(speed: number, kind: 'peg' | 'wall' | 'marble' | 'spinner', pan: number) {
    if (!this.ready() || !this.allow(40)) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = kind === 'peg' || kind === 'marble' ? this.tickBuf : this.clackBuf;
    src.playbackRate.value = (kind === 'marble' ? 1.25 : 0.85) + Math.min(speed, 16) * 0.03 + Math.random() * 0.1;
    const g = ctx.createGain();
    g.gain.value = Math.min(0.9, 0.08 + speed / 14) * (kind === 'wall' ? 0.6 : 1);
    src.connect(g).connect(this.out(pan));
    src.start();
  }

  bumper(pan: number) {
    if (!this.allow(40)) return;
    this.tone('sine', 900, 180, 0.18, 0.35, pan);
    this.tone('square', 1800, 600, 0.05, 0.06, pan);
  }

  sling(pan: number) {
    if (!this.allow(40)) return;
    this.noise(0.06, 0.4, 2600, pan, 3);
    this.tone('square', 600, 1500, 0.09, 0.08, pan);
  }

  tramp(pan: number) {
    if (!this.allow(40)) return;
    // Springy "boing": a quick dip then a rise.
    this.tone('sine', 260, 140, 0.05, 0.22, pan);
    this.tone('sine', 180, 520, 0.16, 0.2, pan, 0.04);
  }

  shatter(pan: number) {
    // Breaking glass: a bright crash of noise with a few high, falling tinkles.
    this.noise(0.25, 0.45, 4200, pan, 1.2);
    this.noise(0.08, 0.3, 1200, pan, 2);
    for (let k = 0; k < 4; k++) {
      const f = 2600 + Math.random() * 2400;
      this.tone('sine', f, f * 0.8, 0.12, 0.05, pan, 0.03 + k * 0.05 + Math.random() * 0.03);
    }
  }

  warp(pan: number) {
    this.tone('sine', 300, 1600, 0.35, 0.2, pan);
    this.tone('triangle', 600, 2400, 0.3, 0.1, pan, 0.05);
  }

  portal(forward: boolean, pan: number) {
    if (forward) this.tone('sine', 500, 1400, 0.22, 0.2, pan);
    else this.tone('sine', 1400, 300, 0.25, 0.2, pan);
  }

  lift(pan: number) {
    this.tone('square', 110, 220, 0.6, 0.06, pan);
    this.tone('triangle', 220, 440, 0.6, 0.1, pan);
  }

  boost(pan: number) {
    this.tone('sawtooth', 200, 900, 0.18, 0.12, pan);
  }

  flip(pan: number) {
    if (!this.allow(40)) return;
    this.noise(0.08, 0.25, 900, pan, 2);
  }

  stamp(pan: number) {
    this.noise(0.12, 0.5, 300, pan, 1.5);
    this.tone('square', 90, 45, 0.12, 0.08, pan);
  }

  stamped(forward: boolean, pan: number) {
    if (forward) this.tone('sawtooth', 300, 1100, 0.16, 0.1, pan);
    else this.tone('sawtooth', 700, 160, 0.2, 0.1, pan);
  }

  klaxon(pan: number) {
    this.tone('square', 520, 520, 0.12, 0.05, pan);
    this.tone('square', 390, 390, 0.12, 0.05, pan, 0.14);
  }

  trapdoor(pan: number) {
    this.tone('square', 160, 70, 0.18, 0.05, pan);
  }

  count(n: number) {
    // Each beep a little higher as the count runs down.
    const f = 440 + (COUNTDOWN - n) * 50;
    this.tone('square', f, f, 0.15, 0.12);
  }

  go() {
    this.tone('square', 880, 880, 0.35, 0.14);
    this.tone('sine', 1320, 1320, 0.35, 0.1);
  }

  lead() {
    this.tone('triangle', 1046, 1046, 0.12, 0.16);
    this.tone('triangle', 1568, 1568, 0.2, 0.14, 0, 0.08);
  }

  eliminated() {
    this.tone('triangle', 400, 200, 0.3, 0.16);
  }

  fanfare() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone('triangle', f, f, i === notes.length - 1 ? 0.8 : 0.16, 0.22, 0, i * 0.12));
    notes.slice(0, 4).forEach((f, i) => this.tone('square', f / 2, f / 2, 0.14, 0.05, 0, i * 0.12));
  }
}
