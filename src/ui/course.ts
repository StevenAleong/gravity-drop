import { MAX_SEGMENTS, SECTIONS } from '../sim/course';
import { load, save } from './store';

/** The sections a custom course can use (the segment templates), in the section guide's order. */
const SEGMENTS = SECTIONS.filter((s) => s.kind === 'segment');
const NAMES = new Map(SEGMENTS.map((s) => [s.id, s.name]));
const KEY = 'gd.courses';

export const segmentName = (id: string) => NAMES.get(id) ?? id;

/** Keeps only known section ids, at most MAX_SEGMENTS (for saved settings and saved courses). */
export function cleanCourse(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === 'string' && NAMES.has(id)).slice(0, MAX_SEGMENTS);
}

/** `n` random sections, never the same one twice in a row. UI only: a race gets the list itself, not a seed. */
export function randomCourse(n: number): string[] {
  const out: string[] = [];
  while (out.length < n) {
    const pool = SEGMENTS.filter((s) => s.id !== out[out.length - 1]);
    out.push(pool[Math.floor(Math.random() * pool.length)].id);
  }
  return out;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/**
 * The setup card's course builder: the ordered list of sections (reorder with ▲/▼ or by dragging the grip),
 * buttons to add each section, and saved courses. The list itself lives in the setup settings.
 */
export class CourseBuilder {
  private list = $<HTMLOListElement>('course-list');
  private add = $('course-add');
  private saved = $<HTMLSelectElement>('saved-course');
  private courses: Record<string, string[]> = load(KEY, {});

  constructor(
    private get: () => string[],
    private set: (ids: string[]) => void,
    onPreview: () => void,
  ) {
    for (const s of SEGMENTS) {
      const b = document.createElement('button');
      b.className = 'small';
      b.textContent = `+ ${s.name}`;
      b.dataset.id = s.id;
      b.addEventListener('click', () => this.update([...this.get(), s.id]));
      this.add.append(b);
    }
    $('btn-course-shuffle').addEventListener('click', () => this.update(randomCourse(5)));
    $('btn-course-clear').addEventListener('click', () => this.update([]));
    $('btn-course-preview').addEventListener('click', onPreview);
    $('btn-course-save').addEventListener('click', () => this.saveCourse());
    $('btn-course-del').addEventListener('click', () => this.deleteCourse());
    this.saved.addEventListener('change', () => {
      const ids = this.courses[this.saved.value];
      if (ids) this.update(cleanCourse(ids));
    });
    this.refresh();
    this.refreshSaved();
  }

  /** Redraws the list; `focus` puts the keyboard focus back on a row's button after it moved. */
  refresh(focus?: { row: number; btn: string }) {
    const ids = this.get();
    this.list.innerHTML = '';
    ids.forEach((id, i) => {
      const li = document.createElement('li');
      li.dataset.i = String(i);
      const grip = document.createElement('span');
      grip.className = 'grip';
      grip.textContent = '⠿';
      grip.title = 'Drag to reorder';
      grip.addEventListener('pointerdown', (e) => this.drag(e, li));
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(i + 1);
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = segmentName(id);
      const btn = (cls: string, text: string, label: string, disabled: boolean, fn: () => void) => {
        const b = document.createElement('button');
        b.className = `icon small ${cls}`;
        b.textContent = text;
        b.title = label;
        b.setAttribute('aria-label', `${label}: ${segmentName(id)}`);
        b.disabled = disabled;
        b.addEventListener('click', fn);
        return b;
      };
      li.append(
        grip,
        num,
        name,
        btn('up', '▲', 'Move up', i === 0, () => this.move(i, i - 1, 'up')),
        btn('down', '▼', 'Move down', i === ids.length - 1, () => this.move(i, i + 1, 'down')),
        btn('remove', '✕', 'Remove', false, () => this.update(ids.filter((_, j) => j !== i))),
      );
      this.list.append(li);
    });
    $('course-empty').classList.toggle('hidden', ids.length > 0);
    $('course-count').textContent = `${ids.length} / ${MAX_SEGMENTS} sections + finish`;
    $<HTMLButtonElement>('btn-course-preview').disabled = ids.length === 0;
    for (const b of this.add.querySelectorAll('button')) b.disabled = ids.length >= MAX_SEGMENTS;
    if (focus) {
      const b = this.list.children[focus.row]?.querySelector<HTMLButtonElement>(`.${focus.btn}`);
      // At the top or bottom that button is disabled; fall back to its partner.
      (b && !b.disabled ? b : this.list.children[focus.row]?.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus();
    }
  }

  private update(ids: string[], focus?: { row: number; btn: string }) {
    this.set(ids.slice(0, MAX_SEGMENTS));
    this.refresh(focus);
  }

  private move(from: number, to: number, btn: string) {
    const ids = this.get().slice();
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id);
    this.update(ids, { row: to, btn });
  }

  /** Drags a row by its grip: it moves among the others as the pointer passes their midpoints. */
  private drag(e: PointerEvent, li: HTMLLIElement) {
    e.preventDefault();
    li.classList.add('dragging');
    const onMove = (ev: PointerEvent) => {
      const others = [...this.list.children].filter((c) => c !== li);
      const before = others.find((c) => {
        const r = c.getBoundingClientRect();
        return ev.clientY < r.top + r.height / 2;
      });
      if (before) {
        if (li.nextElementSibling !== before) this.list.insertBefore(li, before);
      } else if (this.list.lastElementChild !== li) {
        this.list.append(li);
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      li.classList.remove('dragging');
      const ids = this.get();
      const order = [...this.list.children].map((c) => ids[Number((c as HTMLElement).dataset.i)]);
      if (order.some((id, i) => id !== ids[i])) this.update(order);
      else this.refresh();
    };
    // On the window, not the grip with pointer capture: moving the row in the list drops the capture.
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  // ---- saved courses (like saved name lists) ----------------------------------

  private refreshSaved() {
    const names = Object.keys(this.courses).sort();
    this.saved.innerHTML = '';
    const ph = new Option(names.length ? 'Load a course…' : 'No saved courses', '');
    ph.disabled = true;
    ph.selected = true;
    this.saved.add(ph);
    for (const n of names) this.saved.add(new Option(`${n} (${this.courses[n].length})`, n));
  }

  private saveCourse() {
    const ids = this.get();
    if (!ids.length) return;
    const suggest = this.saved.value || (ids.length > 1 ? `${segmentName(ids[0])} + ${ids.length - 1} more` : segmentName(ids[0]));
    const title = prompt('Name this course', suggest)?.trim();
    if (!title) return;
    this.courses[title] = ids.slice();
    save(KEY, this.courses);
    this.refreshSaved();
    this.saved.value = title;
  }

  private deleteCourse() {
    const key = this.saved.value;
    if (!key || !(key in this.courses)) return;
    if (!confirm(`Delete saved course "${key}"?`)) return;
    delete this.courses[key];
    save(KEY, this.courses);
    this.refreshSaved();
  }
}
