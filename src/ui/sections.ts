import { SECTIONS, type SectionKind } from '../sim/course';

const GROUPS: { kind: SectionKind; title: string; label: string; blurb: string }[] = [
  { kind: 'segment', title: 'Course sections', label: 'Course section', blurb: 'Each race stacks these in a random order.' },
  { kind: 'finale', title: 'Final drops', label: 'Final drop', blurb: 'Every race ends with one of these, then the finish line.' },
  {
    kind: 'funnel',
    title: 'Funnel guards',
    label: 'Funnel guard · Funnels on only',
    blurb: 'With Funnels on, every section ends in a funnel guarded by one of these.',
  },
];

const ABOUT: Record<string, string> = {
  'segment:pegs': 'Twelve staggered rows of plain pegs. No tricks, just a long, clicky fall where every bounce can reshuffle the order.',
  'segment:trapdoors':
    'Three floors of swinging trapdoors, each split finer than the last. Marbles pile up and drop through in batches, so whoever sits on the next door to open jumps ahead.',
  'segment:sliders': 'Rows of small shelves that slide side to side and tilt as they go. Land on one and get carried along, then tipped off somewhere new.',
  'segment:trampolines': 'Six rows of springy pads, most of them slowly rocking, so every bounce fires a marble off at a different angle.',
  'segment:pendulums':
    'Six rows of swinging pendulums with bumper balls on the end. A ball that is swinging your way knocks you along with it, so the timing of every hit matters.',
  'segment:portals':
    'A peg field with two portals patrolling a gap in the middle. Touch one and you are sent back to the top of the maze, which happens to about a quarter of the pack.',
  'segment:grinder':
    'The longest section: row after row of spinning windmills, with one big mill in the middle. Neighbours spin opposite ways and bat marbles sideways.',
  'segment:glass':
    'Four full-width floors of glass. The first marble to land on each one is launched back up and the glass shatters, so the leader pays and the pack drops straight through.',
  'segment:glasstiles':
    'Four glass floors, each split into 1 to 4 tiles at random. A tile launches the first marble that lands on it and then shatters, so the first marble into each part of a floor loses time.',
  'finale:pinball':
    'A pinball table: pop bumpers that kick marbles away, slingshots on the walls and quick flippers, then a slingshot funnel down to the finish.',
  'finale:mayhem':
    'Nearly every obstacle in one long finale: pendulums, trampolines, windmills, sliding shelves, a see-saw, flippers, two floors of breakaway glass tiles, three small funnels and two portals that send marbles back up to the see-saw.',
  'funnel:paddles': 'A paddle wheel just under the throat flings each marble left or right as it comes through.',
  'funnel:valve': 'Two half-doors close the throat and swing open together: the pile waits, then bursts out.',
  'funnel:blower': 'A pulsing updraft through the throat blows marbles back up into the pile.',
  'funnel:shuttle': 'A shelf slides back and forth under the throat, catching marbles and tipping them off either side.',
  'funnel:bumper': 'A bumper sits right in the mouth of the funnel and splits the stream.',
  'funnel:glass': 'A glass pane seals the throat. The first marble to land on it gets launched back up the funnel and the glass shatters, so everyone behind pours through.',
};

const key = (i: number) => `${SECTIONS[i].kind}:${SECTIONS[i].id}`;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** The setup screen's section guide (a list with a description of each section) and the preview card. */
export class SectionGuide {
  private modal = $<HTMLDialogElement>('sections-modal');
  private card = $('preview');
  /** Index into SECTIONS of the section being previewed. */
  index = 0;

  /** `onPreview` shows SECTIONS[i] on the stage; `onBack` leaves the preview. */
  constructor(private onPreview: (i: number) => void, private onBack: () => void) {
    $('btn-guide').addEventListener('click', () => this.open());
    $('btn-sections-close').addEventListener('click', () => this.modal.close());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.modal.close(); // click on the backdrop
    });
    $('btn-preview-back').addEventListener('click', () => this.onBack());
    $('btn-sec-prev').addEventListener('click', () => this.step(-1));
    $('btn-sec-next').addEventListener('click', () => this.step(1));
    this.buildList();
  }

  get isOpen() {
    return this.modal.open;
  }

  open() {
    this.modal.showModal();
  }

  /** Shows the previous (-1) or next (+1) section, wrapping around. */
  step(d: number) {
    this.onPreview((this.index + d + SECTIONS.length) % SECTIONS.length);
  }

  /** Fills the preview card for SECTIONS[i] and shows it. `scrolls`: the section is taller than the view. */
  showPreview(i: number, scrolls: boolean) {
    this.index = i;
    const s = SECTIONS[i];
    $('preview-kind').textContent = `${GROUPS.find((g) => g.kind === s.kind)!.label} · ${i + 1} of ${SECTIONS.length}`;
    $('preview-name').textContent = s.name;
    $('preview-about').textContent = ABOUT[key(i)] ?? '';
    this.setScrolls(scrolls);
    this.modal.close();
    this.card.classList.remove('hidden');
  }

  /** Updates the hint for whether the section can be scrolled; returns true if it changed. */
  setScrolls(scrolls: boolean) {
    const text = scrolls ? 'Scroll or drag to look around · ← → to browse' : '← → to browse · Esc to go back';
    const el = $('preview-hint');
    if (el.textContent === text) return false;
    el.textContent = text;
    return true;
  }

  hidePreview() {
    this.card.classList.add('hidden');
  }

  get previewEl() {
    return this.card;
  }

  private buildList() {
    const list = $('sections-list');
    for (const g of GROUPS) {
      const h = document.createElement('h3');
      h.className = 'label';
      h.textContent = g.title;
      const p = document.createElement('p');
      p.className = 'group-blurb';
      p.textContent = g.blurb;
      list.append(h, p);
      SECTIONS.forEach((s, i) => {
        if (s.kind !== g.kind) return;
        const item = document.createElement('div');
        item.className = 'section-item';
        const text = document.createElement('div');
        const name = document.createElement('div');
        name.className = 'section-name';
        name.textContent = s.name;
        const about = document.createElement('p');
        about.textContent = ABOUT[key(i)] ?? '';
        text.append(name, about);
        const btn = document.createElement('button');
        btn.className = 'small';
        btn.textContent = '👁 Preview';
        btn.addEventListener('click', () => this.onPreview(i));
        item.append(text, btn);
        list.append(item);
      });
    }
  }
}
