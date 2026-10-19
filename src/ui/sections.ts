import { SECTIONS, type SectionKind } from '../sim/course';

const GROUPS: { kind: SectionKind; title: string; label: string; blurb: string }[] = [
  { kind: 'segment', title: 'Course sections', label: 'Course section', blurb: 'Each race stacks these in a random order.' },
  {
    kind: 'funnel',
    title: 'Funnel guards',
    label: 'Funnel guard · Funnels on only',
    blurb: 'With Funnels on, every section ends in a funnel guarded by one of these.',
  },
  { kind: 'finish', title: 'Finishes', label: 'Finish', blurb: 'The very bottom of every course, under the last section, with the finish line.' },
];

const ABOUT: Record<string, string> = {
  'segment:pegs': 'Twelve staggered rows of plain pegs. No tricks, just a long, clicky fall where every bounce can reshuffle the order.',
  'segment:trapdoors':
    'Two floors of hatches that take turns: the top floor drops its batch onto the bottom one, which opens as the top closes again. Marbles go through in batches, so whoever just makes a hatch jumps ahead.',
  'segment:sliders': 'Rows of small shelves that slide side to side and tilt as they go. Land on one and get carried along, then tipped off somewhere new.',
  'segment:trampolines': 'Six rows of springy pads, most of them slowly rocking, so every bounce fires a marble off at a different angle.',
  'segment:pendulums':
    'Six rows of swinging pendulums with bumper balls on the end. A ball that is swinging your way knocks you along with it, so the timing of every hit matters.',
  'segment:switches':
    'Speed floors rush the pack down the top funnel into a tree of flip-flop switches. Every marble that passes a switch flips it the other way, so the pack is dealt out across four lanes by arrival order: two glass floors that launch the first marble onto each, a peg zigzag, a windmill or a shelf zigzag.',
  'segment:grinder':
    'The longest section: row after row of spinning windmills, with one big mill in the middle. Neighbours spin opposite ways and bat marbles sideways.',
  'segment:glass':
    'Four full-width floors of glass. The first marble to land on each one is launched back up and the glass shatters, so the leader pays and the pack drops straight through.',
  'segment:glasstiles':
    'Four glass floors, each split into 1 to 4 tiles at random. A tile launches the first marble that lands on it and then shatters, so the first marble into each part of a floor loses time.',
  'segment:pinball': 'A pinball table: big pop bumpers that kick marbles away, then a funnel down to two flippers over a narrow drain, with slingshots in front of them. A lucky marble can slip down an outlane by the wall and skip the flippers.',
  'segment:foosball':
    'A foosball table: eight rods of black and yellow players that slide from wall to wall and kick. The feet bat marbles sideways, and while a rod is away from a wall, a lucky marble can slip straight down the side. At the bottom, everyone is funnelled into the goal.',
  'segment:blackhole':
    'A huge black hole over a round bowl, where normal gravity fades away. Marbles orbit the hole whichever way they came in, crashing into each other as they spiral down. Reach the inner ring and you get sucked in. The inner ring starts small, and once the hole swallows its first marble it keeps growing, so the first ones in can circle for ages while the ones behind get pulled straight through.',
  'segment:mines':
    'A peg field where the pegs are mines. Every so often a peg lights up and glows, then blows up: its blast throws every marble in reach straight away from it, up, down or sideways depending on which side you were, and the peg is gone for a few seconds, leaving a hole in the field. One blast can send the leader flying back up, the next can fire a straggler down past the pack.',
  'finish:funnel':
    'A funnel with slingshots on its walls and a flipper at the bottom of each one, down to the finish line.',
  'finish:halfpipe':
    'A half-pipe with a drain hole in the middle. Everyone drops in from the sides and swings toward the hole. Come in too fast and you jump right over it, while a slower marble behind you drops in.',
  'finish:freefall':
    'A very long free fall to the finish line, with no walls or funnels. The air holds everyone to the same slow fall and keeps the angle you came in at, while boost pads rush up past you. Meet one and you shoot downward, past marbles that were falling ahead of you.',
  'funnel:paddles': 'A paddle wheel just under the throat flings each marble left or right as it comes through.',
  'funnel:valve': 'Two half-doors close the throat and swing wide open together: the pile waits, then bursts out.',
  'funnel:plain': 'Just the funnel, with nothing in the throat. Everyone squeezes through the same gap, jostling for position.',
  'funnel:blower': 'A pulsing updraft through the throat blows marbles back up into the pile.',
  'funnel:shuttle': 'A shelf slides back and forth under the throat, catching marbles and tipping them off either side.',
  'funnel:bumper': 'A bumper sits right in the mouth of the funnel and splits the stream.',
  'funnel:glass': 'A glass pane seals the throat. The first marble to land on it gets launched back up the funnel and the glass shatters, so everyone behind pours through.',
};

const key = (i: number) => `${SECTIONS[i].kind}:${SECTIONS[i].id}`;

/** Indexes into SECTIONS in the order the guide lists them (by GROUPS), which prev/next also follow. */
const ORDER = GROUPS.flatMap((g) => SECTIONS.flatMap((s, i) => (s.kind === g.kind ? [i] : [])));
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** The setup screen's section guide (a list with a description of each section) and the preview card. */
export class SectionGuide {
  private modal = $<HTMLDialogElement>('sections-modal');
  private card = $('preview');
  /** Index into SECTIONS of the section being previewed. */
  index = 0;
  /** Showing the whole custom course rather than one section. */
  private course = false;

  /** `onPreview` shows SECTIONS[i] on the stage; `onBack` leaves the preview. */
  constructor (private onPreview: (i: number) => void, private onBack: () => void) {
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

  /** Shows the previous (-1) or next (+1) section in list order, wrapping around. */
  step(d: number) {
    const pos = ORDER.indexOf(this.index);
    this.onPreview(ORDER[(pos + d + ORDER.length) % ORDER.length]);
  }

  /** Fills the preview card for SECTIONS[i] and shows it. `scrolls`: the section is taller than the view. */
  showPreview(i: number, scrolls: boolean) {
    this.index = i;
    this.setCourseMode(false);
    const s = SECTIONS[i];
    $('preview-kind').textContent = `${GROUPS.find((g) => g.kind === s.kind)!.label} · ${ORDER.indexOf(i) + 1} of ${ORDER.length}`;
    $('preview-name').textContent = s.name;
    $('preview-about').textContent = ABOUT[key(i)] ?? '';
    this.setScrolls(scrolls);
    this.modal.close();
    this.card.classList.remove('hidden');
  }

  /** Fills the preview card for the whole custom course (section names in order) and shows it. */
  showCourse(names: string[], finish: string, funnels: boolean) {
    this.setCourseMode(true);
    $('preview-kind').textContent = `Your course · ${names.length} section${names.length === 1 ? '' : 's'} + finish${funnels ? ' · funnels on' : ''}`;
    $('preview-name').textContent = 'CUSTOM COURSE';
    $('preview-about').textContent = [...names, `FINISH · ${finish}`].join(' → ');
    this.setScrolls(false);
    this.modal.close();
    this.card.classList.remove('hidden');
  }

  /** A course preview has no prev/next, and its back button goes to the setup screen, not the guide. */
  private setCourseMode(course: boolean) {
    this.course = course;
    $('btn-sec-prev').classList.toggle('hidden', course);
    $('btn-sec-next').classList.toggle('hidden', course);
    $('btn-preview-back').textContent = course ? '← Back to setup' : '← Section guide';
  }

  /** Updates the hint for whether the section can be scrolled; returns true if it changed. */
  setScrolls(scrolls: boolean) {
    const text = this.course
      ? scrolls
        ? 'Scroll or drag to look around · Esc to go back'
        : 'Esc to go back'
      : scrolls
        ? 'Scroll or drag to look around · ← → to browse'
        : '← → to browse · Esc to go back';
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
