import { SEGMENT_COUNTS } from '../sim/course';
import { segmentCount, type RaceLength, type WinMode } from '../sim/sim';

export interface Settings {
  /** Number of random segments; Short/Medium/Epic are presets (see SEGMENT_COUNTS). */
  length: number;
  mode: WinMode;
  funnels: boolean;
  /** Finale id, or 'random' to let the seed pick. */
  finale: string;
}

export interface HistoryEntry {
  name: string;
  of: number;
  at: number;
}

const KEY = { names: 'gd.names', settings: 'gd.settings', lists: 'gd.lists', history: 'gd.history' };
const MAX_NAMES = 100;
/** Winners kept in storage; the setup card shows only the latest few, the modal shows them all. */
const MAX_HISTORY = 100;
const HISTORY_PREVIEW = 5;

export const SAMPLE_NAMES = ['Ava', 'Ben', 'Chloe', 'Diego', 'Emma', 'Felix', 'Grace', 'Hiro'];

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode etc.) — settings just won't persist */
  }
}

export function parseNames(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_NAMES);
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Setup screen: names, saved lists, settings and pick history (all persisted in localStorage). */
export class Setup {
  private root = $('setup');
  private textarea = $<HTMLTextAreaElement>('names');
  private count = $('name-count');
  private saved = $<HTMLSelectElement>('saved');
  private dropBtn = $<HTMLButtonElement>('btn-drop');
  private historyEl = $('history');
  private modal = $<HTMLDialogElement>('history-modal');
  private segCount = $<HTMLInputElement>('seg-count');
  // Merge over defaults so settings saved before a field existed still load.
  settings: Settings = {
    length: SEGMENT_COUNTS.medium,
    mode: 'first',
    funnels: false,
    finale: 'random',
    ...load<Partial<Settings>>(KEY.settings, {}),
  };
  private lists: Record<string, string> = load(KEY.lists, {});
  private history: HistoryEntry[] = load(KEY.history, []);

  constructor(private onDrop: () => void, private onNamesChanged: () => void) {
    // Older saves stored a preset name ('short' etc.); segmentCount maps those and clamps anything else.
    this.settings.length = segmentCount(this.settings.length as RaceLength | number);
    this.textarea.value = load<string>(KEY.names, SAMPLE_NAMES.join('\n'));
    this.textarea.addEventListener('input', () => {
      save(KEY.names, this.textarea.value);
      this.refreshCount();
      this.onNamesChanged();
    });

    for (const seg of document.querySelectorAll<HTMLElement>('.seg')) {
      const key = seg.dataset.key as keyof Settings;
      seg.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('button');
        if (!btn) return;
        const v = btn.dataset.v!;
        if (key === 'funnels') this.settings.funnels = v === 'on';
        else if (key === 'length') this.settings.length = SEGMENT_COUNTS[v as RaceLength];
        else if (key === 'finale') this.settings.finale = v;
        else this.settings.mode = v as WinMode;
        save(KEY.settings, this.settings);
        this.refreshSegs();
      });
    }

    this.segCount.addEventListener('input', () => {
      const v = this.segCount.valueAsNumber;
      if (Number.isNaN(v)) return; // mid-edit (empty box); keep the last good value
      this.settings.length = segmentCount(v);
      save(KEY.settings, this.settings);
      this.refreshSegs(false);
    });
    this.segCount.addEventListener('change', () => this.refreshSegs());

    this.dropBtn.addEventListener('click', () => this.onDrop());
    $('btn-save').addEventListener('click', () => this.saveList());
    $('btn-del').addEventListener('click', () => this.deleteList());
    this.saved.addEventListener('change', () => {
      const v = this.lists[this.saved.value];
      if (v === undefined) return;
      this.setNames(parseNames(v));
    });

    // All-winners modal. Clearing takes a second, explicit click so it can't happen by accident.
    $('btn-history-close').addEventListener('click', () => this.modal.close());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.modal.close(); // click on the backdrop
    });
    $('btn-history-clear').addEventListener('click', () => this.askClear(true));
    $('btn-clear-no').addEventListener('click', () => this.askClear(false));
    $('btn-clear-yes').addEventListener('click', () => {
      this.history = [];
      save(KEY.history, this.history);
      this.refreshHistory();
      this.modal.close();
    });

    this.refreshSegs();
    this.refreshCount();
    this.refreshLists();
    this.refreshHistory();
  }

  /** True while a modal is open, so global hotkeys (Space to drop, Esc) leave it alone. */
  get modalOpen() {
    return this.modal.open;
  }

  get visible() {
    return !this.root.classList.contains('hidden');
  }

  show() {
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
  }

  /** Right edge of the card in px (so the demo race can be framed beside it). */
  cardRight() {
    return (this.root.firstElementChild as HTMLElement).getBoundingClientRect().right;
  }

  names() {
    return parseNames(this.textarea.value);
  }

  setNames(names: string[]) {
    this.textarea.value = names.join('\n');
    save(KEY.names, this.textarea.value);
    this.refreshCount();
    this.onNamesChanged();
  }

  recordWinner(name: string, of: number) {
    this.history.unshift({ name, of, at: Date.now() });
    this.history = this.history.slice(0, MAX_HISTORY);
    save(KEY.history, this.history);
    this.refreshHistory();
  }

  /** Highlights the chosen buttons; `syncInput` also writes the (clamped) segment count back into its box. */
  private refreshSegs(syncInput = true) {
    for (const seg of document.querySelectorAll<HTMLElement>('.seg')) {
      const key = seg.dataset.key as keyof Settings;
      for (const b of seg.querySelectorAll('button')) {
        const v = b.dataset.v!;
        const on =
          key === 'length'
            ? SEGMENT_COUNTS[v as RaceLength] === this.settings.length
            : key === 'funnels'
              ? (v === 'on') === this.settings.funnels
              : v === String(this.settings[key]);
        b.classList.toggle('on', on);
      }
    }
    if (syncInput) this.segCount.value = String(this.settings.length);
  }

  private refreshCount() {
    const n = this.names().length;
    this.count.textContent = n === 1 ? '1 marble' : `${n} marbles`;
    this.dropBtn.disabled = n < 2;
    this.dropBtn.title = n < 2 ? 'Add at least two names' : '';
  }

  private refreshLists() {
    const names = Object.keys(this.lists).sort();
    this.saved.innerHTML = '';
    const ph = new Option(names.length ? 'Load a saved list…' : 'No saved lists yet', '');
    ph.disabled = true;
    ph.selected = true;
    this.saved.add(ph);
    for (const n of names) this.saved.add(new Option(n, n));
  }

  private saveList() {
    const names = this.names();
    if (!names.length) return;
    const title = prompt('Name this list', this.saved.value || `${names[0]} + ${names.length - 1} more`);
    if (!title) return;
    this.lists[title.trim()] = names.join('\n');
    save(KEY.lists, this.lists);
    this.refreshLists();
    this.saved.value = title.trim();
  }

  private deleteList() {
    const key = this.saved.value;
    if (!key || !(key in this.lists)) return;
    if (!confirm(`Delete saved list "${key}"?`)) return;
    delete this.lists[key];
    save(KEY.lists, this.lists);
    this.refreshLists();
  }

  private refreshHistory() {
    this.historyEl.innerHTML = '';
    if (!this.history.length) return;
    const head = document.createElement('div');
    head.className = 'history-head';
    const h = document.createElement('h3');
    h.className = 'label';
    h.textContent = 'Recent picks';
    head.append(h);
    if (this.history.length > HISTORY_PREVIEW) {
      const more = document.createElement('button');
      more.className = 'ghost small';
      more.textContent = `Show all (${this.history.length})`;
      more.addEventListener('click', () => this.openHistory());
      head.append(more);
    }
    const ol = document.createElement('ol');
    ol.className = 'history-list';
    this.fillHistory(ol, this.history.slice(0, HISTORY_PREVIEW));
    this.historyEl.append(head, ol);
  }

  private fillHistory(ol: HTMLElement, entries: HistoryEntry[]) {
    ol.innerHTML = '';
    for (const e of entries) {
      const li = document.createElement('li');
      const a = document.createElement('span');
      a.textContent = `🏆 ${e.name}`;
      const b = document.createElement('span');
      b.textContent = `of ${e.of} · ${new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
      li.append(a, b);
      ol.append(li);
    }
  }

  private openHistory() {
    this.fillHistory($('history-all'), this.history);
    this.askClear(false);
    this.modal.showModal();
  }

  private askClear(asking: boolean) {
    $('history-foot').classList.toggle('hidden', asking);
    $('history-confirm').classList.toggle('hidden', !asking);
    const n = this.history.length;
    $('history-confirm-text').textContent = `Clear all ${n} winner${n === 1 ? '' : 's'}? This can't be undone.`;
    if (asking) $('btn-clear-no').focus();
  }
}
