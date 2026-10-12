import RAPIER from '@dimforge/rapier2d-compat';
import { Application } from 'pixi.js';
import { Sfx } from './audio/sfx';
import { BG } from './render/palette';
import { Renderer } from './render/renderer';
import { DT } from './sim/constants';
import { randomSeed } from './sim/rng';
import { Sim, type Marble, type SimOptions } from './sim/sim';
import type { SimEvent } from './sim/types';
import { SECTIONS } from './sim/course';
import { Hud } from './ui/hud';
import { SectionGuide } from './ui/sections';
import { SAMPLE_NAMES, Setup } from './ui/setup';
import './style.css';

const $ = (id: string) => document.getElementById(id)!;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

// Startup lives in a function rather than top-level await: Pixi lazy-loads chunks that import
// back into this entry module, and a pending top-level await would deadlock them in production builds.
async function boot() {
  await RAPIER.init();

  const app = new Application();
  await app.init({
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    background: BG,
  });
  $('stage').appendChild(app.canvas);

  const renderer = new Renderer(app);
  const sfx = new Sfx();
  const hud = new Hud((idx) => setFollow(followIdx === idx ? null : idx));
  const setup = new Setup(() => startRace(freshOptions()), () => scheduleDemo());
  const guide = new SectionGuide((i) => showSection(i), () => leavePreview());

  type Screen = 'setup' | 'race' | 'winner' | 'preview';
  let screen: Screen = 'setup';
  let sim: Sim | null = null;
  let lastOpts: SimOptions | null = null;
  let acc = 0;
  let timeScale = 1;
  let followIdx: number | null = null;
  let winnerAt = 0;
  /** Slow motion stays on until this time (ms), so it lingers just past the finish line. */
  let dramaUntil = 0;
  /** The player closed the winner card to keep watching the rest of the field. */
  let watching = false;
  let lastLeadBanner = 0;
  let finalStretchShown = false;
  let demoTimer = 0;

  const winnerEl = $('winner');
  const followBtn = $('btn-follow');
  const muteBtn = $('btn-mute');
  const resultsBtn = $('btn-results');
  /** When the last marble finished while the player was watching (ms), to bring the winner card back. */
  let allDoneAt = 0;

  // ---- race lifecycle ---------------------------------------------------------

  function freshOptions(): SimOptions {
    const s = setup.settings;
    const finish = s.finish === 'random' ? undefined : s.finish;
    return { names: setup.names(), seed: randomSeed(), length: s.length, mode: s.mode, funnels: s.funnels, finish };
  }

  function load(opts: SimOptions) {
    sim?.dispose();
    sim = new Sim(opts);
    renderer.build(sim);
    renderer.preview = null;
    acc = 0;
    timeScale = 1;
    dramaUntil = 0;
    watching = false;
    allDoneAt = 0;
    resultsBtn.classList.add('hidden');
    followIdx = null;
    finalStretchShown = false;
    followBtn.classList.add('active');
  }

  function startDemo() {
    const names = setup.names();
    load({ names: names.length >= 2 ? names : SAMPLE_NAMES, seed: randomSeed(), length: 'short', mode: 'first' });
  }

  /** Rebuild the background demo shortly after the names stop changing. */
  function scheduleDemo() {
    if (screen !== 'setup') return;
    clearTimeout(demoTimer);
    demoTimer = window.setTimeout(startDemo, 600);
  }

  // ---- section preview ----------------------------------------------------------

  /** Shows one section on its own, from the section guide, with marbles dropping through it nonstop. */
  function showSection(i: number) {
    clearTimeout(demoTimer);
    screen = 'preview';
    setup.hide();
    document.body.classList.add('previewing');
    const { kind, id } = SECTIONS[i];
    load({ names: [], seed: randomSeed(), length: 1, mode: 'first', section: { kind, id } });
    renderer.preview = { y: sim!.topY, auto: true, dir: 1, hold: 1.2 };
    guide.showPreview(i, false);
    layout();
  }

  /** Back from a preview to the setup screen, with the section guide open again. */
  function leavePreview() {
    if (screen !== 'preview') return;
    guide.hidePreview();
    document.body.classList.remove('previewing');
    toSetup();
    guide.open();
  }

  // Wheel or drag to scroll a section that's taller than the view (this stops the auto-pan).
  function scrollPreview(dy: number) {
    const p = renderer.preview;
    if (screen !== 'preview' || !p || !renderer.previewScrolls) return;
    p.auto = false;
    p.y += dy / renderer.scale;
  }
  app.canvas.addEventListener('wheel', (e) => scrollPreview(e.deltaY), { passive: true });
  let dragY: number | null = null;
  app.canvas.addEventListener('pointerdown', (e) => {
    if (screen === 'preview') dragY = e.clientY;
  });
  window.addEventListener('pointermove', (e) => {
    if (dragY === null) return;
    scrollPreview(dragY - e.clientY);
    dragY = e.clientY;
  });
  window.addEventListener('pointerup', () => (dragY = null));
  window.addEventListener('pointercancel', () => (dragY = null));

  function startRace(opts: SimOptions) {
    if (opts.names.length < 2) return;
    sfx.unlock();
    screen = 'race';
    lastOpts = opts;
    setup.hide();
    winnerEl.classList.add('hidden');
    hud.show();
    load(opts);
    hud.build(sim!);
    layout();
  }

  function toSetup() {
    if (screen === 'preview') {
      guide.hidePreview();
      document.body.classList.remove('previewing');
    }
    screen = 'setup';
    winnerEl.classList.add('hidden');
    hud.hide();
    setup.show();
    layout();
    startDemo();
  }

  function showWinner() {
    if (!sim?.winner) return;
    screen = 'winner';
    const w = sim.winner;
    const first = sim.opts.mode === 'first';
    $('win-label').textContent = first ? '🏆 WINNER 🏆' : '🏆 LAST ONE STANDING 🏆';
    const nameEl = $('win-name');
    nameEl.textContent = w.name;
    nameEl.style.color = hex(w.color);
    const time = first ? w.finishTime : sim.raceTime;
    const extra = first ? `${sim.leadChanges} lead change${sim.leadChanges === 1 ? '' : 's'}` : `${sim.marbles.length - 1} eliminated`;
    $('win-stats').textContent = `${time.toFixed(2)}s · ${extra} · ${sim.marbles.length} marbles`;
    $('btn-remove').textContent = `Remove ${w.name.length > 14 ? 'winner' : w.name} & race again`;
    // Only offer to keep watching while someone is still out on the course.
    $('btn-watch').classList.toggle('hidden', sim.marbles.every((m) => m.finished));
    resultsBtn.classList.add('hidden');
    winnerEl.classList.remove('hidden');
  }

  /** Close the winner card and follow the marbles still racing; the card comes back when they're all in. */
  function continueWatching() {
    if (!sim?.winner) return;
    watching = true;
    screen = 'race';
    winnerEl.classList.add('hidden');
    resultsBtn.classList.remove('hidden');
  }

  $('btn-watch').addEventListener('click', continueWatching);
  resultsBtn.addEventListener('click', showWinner);

  $('btn-again').addEventListener('click', () => lastOpts && startRace({ ...lastOpts, names: setup.names(), seed: randomSeed() }));
  $('btn-replay').addEventListener('click', () => lastOpts && startRace(lastOpts));
  $('btn-edit').addEventListener('click', toSetup);
  $('btn-exit').addEventListener('click', toSetup);
  $('btn-remove').addEventListener('click', () => {
    if (!sim?.winner || !lastOpts) return;
    const names = setup.names();
    const i = names.indexOf(sim.winner.name);
    if (i >= 0) names.splice(i, 1);
    setup.setNames(names);
    if (names.length < 2) return toSetup();
    startRace({ ...lastOpts, names, seed: randomSeed() });
  });

  function setFollow(idx: number | null) {
    followIdx = idx;
    followBtn.classList.toggle('active', idx === null);
  }
  followBtn.addEventListener('click', () => setFollow(null));

  function setMuted(muted: boolean) {
    sfx.enabled = !muted;
    muteBtn.textContent = muted ? '🔇' : '🔊';
  }
  muteBtn.addEventListener('click', () => setMuted(sfx.enabled));

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }
  $('btn-full').addEventListener('click', toggleFullscreen);

  window.addEventListener('keydown', (e) => {
    const typing = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
    if (typing || setup.modalOpen || guide.isOpen) return;
    if (screen === 'preview') {
      if (e.key === 'Escape') {
        // Or the same keypress's default action closes the guide as soon as it reopens.
        e.preventDefault();
        leavePreview();
      }
      else if (e.key === 'ArrowLeft') guide.step(-1);
      else if (e.key === 'ArrowRight') guide.step(1);
      return;
    }
    if (e.key === 'Escape') toSetup();
    else if (e.key === 'm' || e.key === 'M') setMuted(sfx.enabled);
    else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (screen === 'setup') startRace(freshOptions());
      else if (screen === 'winner') $('btn-again').click();
    }
  });

  // ---- layout -----------------------------------------------------------------

  function layout() {
    const w = window.innerWidth;
    const wide = w > 760;
    if (screen === 'preview') {
      const card = guide.previewEl.getBoundingClientRect();
      renderer.insets = wide
        ? { left: card.right + 10, right: 0, top: 10, bottom: 10 }
        : { left: 0, right: 0, top: 10, bottom: window.innerHeight - card.top + 8 };
    } else if (screen === 'setup') {
      renderer.insets = wide ? { left: setup.cardRight() + 10, right: 0, top: 0, bottom: 0 } : { left: 0, right: 0, top: 0, bottom: 0 };
    } else {
      renderer.insets = wide ? { left: 40, right: 284, top: 56, bottom: 0 } : { left: 20, right: 0, top: 50, bottom: 0 };
    }
    // Banners and the countdown centre on the play arena, not the whole window (skipping the standings).
    const { left, right } = renderer.insets;
    const root = document.documentElement.style;
    root.setProperty('--arena-cx', `${left + (w - left - right) / 2}px`);
    root.setProperty('--arena-w', `${w - left - right}px`);
  }
  window.addEventListener('resize', layout);

  // ---- events → audio / callouts ------------------------------------------------

  function vibrate(p: number | number[]) {
    if ('vibrate' in navigator) navigator.vibrate(p);
  }

  function handle(e: SimEvent) {
    renderer.onEvent(e);
    if (screen === 'setup' || screen === 'preview' || !sim) return;
    const m = 'marble' in e ? sim.marbles[e.marble] : null;
    const first = sim.opts.mode === 'first';
    const pan = (x: number) => renderer.pan(x);
    const seen = (y: number) => renderer.isVisible(y);
    switch (e.type) {
      case 'count':
        hud.count(String(e.n));
        sfx.count(e.n);
        break;
      case 'gate':
        hud.count('GO!');
        sfx.go();
        break;
      case 'hit':
        if (seen(e.y)) sfx.hit(e.speed, e.target, pan(e.x));
        break;
      case 'bumper':
        if (seen(e.y)) sfx.bumper(pan(e.x));
        break;
      case 'sling':
        if (seen(e.y)) sfx.sling(pan(e.x));
        break;
      case 'tramp':
        if (seen(e.y)) sfx.tramp(pan(e.x));
        break;
      case 'shatter':
        if (seen(e.y)) sfx.shatter(pan(e.x));
        break;
      case 'flip':
        if (seen(e.y)) sfx.flip(pan(e.x));
        break;
      case 'trapdoor':
        if (seen(e.y)) sfx.trapdoor(pan(e.x));
        break;
      case 'boost':
        if (seen(e.y)) sfx.boost(pan(e.x));
        break;
      case 'stamp':
        if (seen(e.y)) sfx.stamp(pan(e.x));
        break;
      case 'stamped':
        if (seen(e.y)) sfx.stamped(e.forward, pan(e.x));
        hud.tick(e.forward ? `🔨 ${m!.name} gets stamped down the line!` : `🔨 ${m!.name} gets rejected and knocked back!`);
        break;
      case 'klaxon':
        if (seen(e.y)) sfx.klaxon(pan(e.x));
        break;
      case 'warp':
        sfx.warp(pan(e.x));
        // Only the stuck-marble rescue warps now; it just drops the marble a little further on.
        hud.tick(`🛟 ${m!.name} got unstuck`);
        break;
      case 'portal':
        if (seen(e.y) || seen(e.fromY)) sfx.portal(e.forward, pan(e.x));
        hud.tick(e.hole ? `🕳 ${m!.name} got swallowed by a black hole!` : e.forward ? `🌀 ${m!.name} found a shortcut!` : `🌀 ${m!.name} got portaled backwards!`);
        break;
      case 'lift':
        if (seen(e.y)) sfx.lift(pan(e.x));
        hud.tick(`⬆ ${m!.name} rides the elevator of doom`);
        break;
      case 'lead': {
        const now = performance.now();
        if (now - lastLeadBanner > 2500) {
          hud.showBanner(`👑 ${m!.name} takes the lead!`, hex(m!.color));
          lastLeadBanner = now;
        } else {
          hud.tick(`👑 ${m!.name} grabs the lead`);
        }
        sfx.lead();
        break;
      }
      case 'comeback':
        hud.showBanner(`🔥 COMEBACK! ${m!.name}`, '#ff9a3d', 2000);
        lastLeadBanner = performance.now();
        break;
      case 'segment':
        hud.tick(`${m!.name} leads into ${e.name}`);
        break;
      case 'finish':
        if (first) {
          if (e.place > 1) hud.tick(`🏁 ${m!.name} finishes #${e.place}`);
        } else if (sim.winner === null || sim.winner !== m) {
          sfx.eliminated();
          const left = sim.marbles.length - sim.finishedCount;
          if (left === 2) hud.showBanner('FINAL TWO!', '#ffd34d');
          else if (left > 1) hud.showBanner(`❌ ${m!.name} is OUT`, hex(m!.color), 1200);
        }
        break;
      case 'winner':
        sfx.fanfare();
        hud.showBanner(`🏆 ${m!.name} WINS!`, hex(m!.color), 2500);
        vibrate([60, 40, 140]);
        winnerAt = performance.now();
        setup.recordWinner(m!.name, sim.marbles.length);
        break;
    }
  }

  // ---- frame loop -------------------------------------------------------------

  /** The marble the race is "about": the leader, or in last-one-standing the next one to be eliminated. */
  function frontRunner(s: Sim): Marble | null {
    if (!s.marbles.length) return null; // a section preview
    // While watching the rest of the field, follow whoever is still racing.
    if (s.winner && !watching) return s.winner;
    // Everyone is in: stay on the last marble to finish, at the bottom. (With no target at all, the
    // camera would drift back up to the start gate.)
    if (s.marbles.every((m) => m.finished)) return s.marbles.reduce((a, b) => (b.place > a.place ? b : a));
    if (s.opts.mode === 'first' && s.leader && !s.leader.finished) return s.leader;
    return s.ranking.find((m) => !m.finished) ?? null;
  }

  /**
   * A close finish worth slowing down for: the leader is in the last 7 m and the runner-up is under 2 m or
   * under ~0.3 s behind (at its current speed). Marbles fall the last few metres in about half a second, so
   * the old 5 m / 1.6 m test missed some photo finishes. Tested over 400 races: on in the last 0.4 s of all
   * 23 close (<0.3 s) finishes, for ~1.3 s of race time each and ~0.4 s per race overall.
   */
  function isDramatic(s: Sim): boolean {
    if (s.winner || s.phase !== 'racing') return false;
    const live = s.ranking.filter((m) => !m.finished);
    if (s.opts.mode === 'first') {
      const [a, b] = live;
      if (!a || !b || s.finishY - a.y > 7) return false;
      const gap = a.y - b.y;
      return gap < 2.0 || gap / Math.max(1, b.body.linvel().y) < 0.3;
    }
    if (live.length !== 2) return false;
    const [a, b] = live;
    return s.finishY - a.y < 7 && Math.abs(a.y - b.y) < 2.5;
  }

  app.ticker.add((ticker) => {
    if (!sim) return;
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    const racing = screen === 'race' || screen === 'winner';

    // Keep the slow motion going for a moment after the line is crossed, so the photo finish itself
    // plays slowly. Ease in fast (the finish is over in a blink) and back out gently.
    if (racing && isDramatic(sim)) dramaUntil = performance.now() + 900;
    const drama = racing && performance.now() < dramaUntil;
    timeScale += ((drama ? 0.3 : 1) - timeScale) * Math.min(1, dt * (drama ? 10 : 3));

    acc += dt * timeScale;
    let steps = 0;
    while (acc >= DT && steps < 12) {
      sim.step();
      acc -= DT;
      steps++;
    }
    if (steps === 12) acc = 0;

    for (const e of sim.events) handle(e);
    sim.events.length = 0;

    const front = frontRunner(sim);
    if (racing && !finalStretchShown && front && !sim.winner && sim.opts.mode === 'first' && sim.finishY - front.y < 9) {
      finalStretchShown = true;
      hud.showBanner('FINAL STRETCH!', '#5dff9a', 1300);
    }

    // Hold the camera on the start mixer during the countdown rather than chasing a bouncing marble.
    const target = followIdx !== null ? sim.marbles[followIdx] : sim.phase === 'countdown' ? null : front;
    const crown = sim.phase === 'countdown' || screen === 'preview' ? -1 : (sim.winner?.idx ?? front?.idx ?? -1);
    renderer.update(dt, target, drama ? 1.35 : 1, crown, followIdx);
    // The hint can change the card's height (and so the space left for the section) on phones.
    if (screen === 'preview' && guide.setScrolls(renderer.previewScrolls)) layout();
    if (racing) hud.update(sim, followIdx, front);

    if (screen === 'race' && sim.winner && !watching && performance.now() - winnerAt > 1900) showWinner();
    if (screen === 'race' && watching && sim.marbles.every((m) => m.finished)) {
      allDoneAt ||= performance.now();
      if (performance.now() - allDoneAt > 1500) showWinner();
    }
    if (screen === 'setup' && sim.winner && sim.raceTime - sim.winner.finishTime > 4) startDemo();
  });

  layout();
  startDemo();
}

void boot();
