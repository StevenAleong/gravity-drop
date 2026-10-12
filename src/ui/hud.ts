import { SEGMENT_COUNTS } from '../sim/course';
import { segmentCount, type Marble, type RaceLength, type Sim } from '../sim/sim';

const $ = (id: string) => document.getElementById(id)!;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

interface Row {
  el: HTMLElement;
  pos: HTMLElement;
  st: HTMLElement;
  rank: number;
  cls: string;
}

/** DOM overlay during a race: standings, minimap, banners, ticker and countdown. */
export class Hud {
  readonly root = $('hud');
  private rowsEl = $('board-rows');
  private track = $('mm-track');
  private banner = $('banner');
  private ticker = $('ticker');
  private countdown = $('countdown');
  private info = $('race-info');
  private rows: Row[] = [];
  private order: Marble[] = [];
  private dots: HTMLElement[] = [];
  private bannerTimer = 0;
  private lastDom = 0;
  private rowH = 30;

  constructor(private onFollow: (idx: number) => void) {
    const board = $('board');
    board.querySelector('.board-head')!.addEventListener('click', () => board.classList.toggle('collapsed'));
  }

  show() {
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
  }

  build(sim: Sim) {
    this.rowsEl.innerHTML = '';
    this.track.innerHTML = '';
    this.ticker.innerHTML = '';
    this.banner.classList.remove('show');
    this.countdown.textContent = '';
    this.rows = [];
    this.order = [];
    this.dots = [];
    this.rowH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-h')) || 30;

    const { mode, length, segments } = sim.opts;
    $('board').querySelector('.board-head span')!.textContent = mode === 'first' ? 'STANDINGS' : 'SAFEST FIRST';
    const n = segmentCount(length);
    const preset = (Object.keys(SEGMENT_COUNTS) as RaceLength[]).find((k) => SEGMENT_COUNTS[k] === n);
    const course = segments?.length ? `Custom · ${segments.length} segment${segments.length === 1 ? '' : 's'}` : (preset ?? `${n} segments`);
    this.info.innerHTML = `<b>${mode === 'first' ? 'First to finish' : 'Last one standing'}</b> · ${course}`;

    for (const m of sim.marbles) {
      const el = document.createElement('div');
      el.className = 'brow';
      const pos = document.createElement('span');
      pos.className = 'pos';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = hex(m.color);
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = m.name;
      const st = document.createElement('span');
      st.className = 'st';
      el.append(pos, dot, nm, st);
      el.addEventListener('click', () => this.onFollow(m.idx));
      this.rowsEl.append(el);
      this.rows.push({ el, pos, st, rank: -1, cls: '' });

      const d = document.createElement('div');
      d.className = 'dot';
      d.style.background = hex(m.color);
      d.title = m.name;
      this.track.append(d);
      this.dots.push(d);
    }
    this.rowsEl.style.height = `${sim.marbles.length * this.rowH}px`;

    const span = sim.finishY - sim.gateY;
    for (const s of sim.segments) {
      const t = document.createElement('div');
      t.className = 'tick';
      t.style.top = `${Math.max(0, ((s.y0 - sim.gateY) / span) * 100)}%`;
      t.title = s.name;
      this.track.append(t);
    }
    const flag = document.createElement('div');
    flag.className = 'flag';
    flag.textContent = '🏁';
    this.track.append(flag);
  }

  update(sim: Sim, followIdx: number | null, leader: Marble | null) {
    const now = performance.now();
    if (now - this.lastDom < 90) return;
    this.lastDom = now;

    const first = sim.opts.mode === 'first';
    this.reorder(sim);
    this.order.forEach((m, rank) => {
      const row = this.rows[m.idx];
      if (row.rank === rank) return;
      if (row.rank > rank && row.rank >= 0 && sim.phase !== 'countdown') {
        row.el.classList.remove('up');
        void row.el.offsetWidth;
        row.el.classList.add('up');
      }
      row.rank = rank;
      row.el.style.transform = `translateY(${rank * this.rowH}px)`;
      row.pos.textContent = String(rank + 1);
    });

    for (const m of sim.marbles) {
      const row = this.rows[m.idx];

      let status = '';
      if (sim.winner === m) status = first ? `👑 ${m.finishTime.toFixed(2)}s` : '👑';
      else if (m.finished) status = first ? `🏁 ${m.finishTime.toFixed(1)}s` : 'OUT';
      else if (m.ghost) status = '⬆ lift';
      else if (sim.phase === 'countdown') status = '';
      else if (!first) status = `${Math.max(0, sim.finishY - m.y).toFixed(0)}m to go`;
      else if (leader && m !== leader) status = `-${Math.max(0, leader.y - m.y).toFixed(1)}m`;
      if (row.st.textContent !== status) row.st.textContent = status;

      const cls = [
        'brow',
        m.idx === followIdx ? 'me' : '',
        !first && m.finished && sim.winner !== m ? 'out' : '',
        sim.winner === m ? 'win' : '',
        row.el.classList.contains('up') ? 'up' : '',
      ]
        .filter(Boolean)
        .join(' ');
      if (cls !== row.cls) {
        row.el.className = cls;
        row.cls = cls;
      }

      const d = this.dots[m.idx];
      d.style.top = `${sim.progress(m) * 100}%`;
      d.classList.toggle('me', m.idx === followIdx || (followIdx === null && m === leader));
    }
  }

  /**
   * Displayed order follows the sim's ranking, but two marbles only swap places once one is clearly
   * ahead, so neck-and-neck marbles don't make the board flicker.
   */
  private reorder(sim: Sim) {
    if (this.order.length !== sim.marbles.length) this.order = sim.ranking.slice();
    // The start mixer bounces everyone around during the countdown; hold the board still until GO.
    if (sim.phase === 'countdown') return;
    const o = this.order;
    // In last-one-standing the board is "who's safest": hindmost on top, eliminated at the bottom.
    const first = sim.opts.mode === 'first';
    const ahead = (a: Marble, b: Marble) => {
      if (a.finished || b.finished) {
        if (first) return a.finished && (!b.finished || a.place < b.place);
        return sim.winner === a || (!a.finished && b !== sim.winner) || (a.finished && b.finished && a.place > b.place);
      }
      return first ? a.y - b.y > 0.35 : b.y - a.y > 0.35;
    };
    for (let pass = 0; pass < o.length; pass++) {
      let swapped = false;
      for (let i = 0; i < o.length - 1; i++) {
        if (ahead(o[i + 1], o[i])) {
          [o[i], o[i + 1]] = [o[i + 1], o[i]];
          swapped = true;
        }
      }
      if (!swapped) break;
    }
  }

  showBanner(text: string, color = '#ffffff', ms = 1600) {
    this.banner.textContent = text;
    this.banner.style.color = color;
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.banner.classList.remove('show'), ms);
  }

  tick(text: string) {
    const el = document.createElement('div');
    el.textContent = text;
    this.ticker.prepend(el);
    while (this.ticker.children.length > 4) this.ticker.lastElementChild!.remove();
    setTimeout(() => (el.style.opacity = '0'), 5000);
    setTimeout(() => el.remove(), 5700);
  }

  count(text: string) {
    this.countdown.textContent = text;
    this.countdown.classList.remove('pop');
    void this.countdown.offsetWidth;
    this.countdown.classList.add('pop');
  }
}
