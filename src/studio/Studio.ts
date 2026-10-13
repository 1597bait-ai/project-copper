// Copper Studio: the developer's app for balancing the game without touching code. It edits a
// draft of every value the schema lists (src/config/schema.ts) and the school map, play tests the
// draft straight away, and "Save to game" makes it the version everyone plays (see save.ts).
//
// The draft lives in this browser (localStorage) until it is saved; the saved version is the
// tuning file embedded in the page. Plain DOM over the game's canvas, styled by styles.ts.

import type Phaser from 'phaser';
import { CHARACTERS, CHARACTER_ORDER } from '../config/characters';
import { FIELD_BY_PATH, SECTIONS, type Field, type FieldGroup, type Section } from '../config/schema';
import { DEFAULTS, applyTuning, checkOverrides, getPath, makeSave, parseTuning, stringifyTuning, valuesWith, type Overrides, type TuningFile, type Values } from '../config/tuning';
import type { EditorLink } from '../scenes/EditorScene';
import { loadSave } from '../systems/save';
import { unlockAudio } from '../systems/sfx';
import { setPlayTestLabel, shortDate } from '../ui/balanceLabel';
import { parseMap } from '../world/mapText';
import { DEFAULT_MAP } from '../world/maps';
import { validateMap } from '../world/validate';
import { knownSaveEnv, saveEnv } from './access';
import { confirmDialog, openDialog, type Dialog } from './dialogs';
import { copyText, h, type Child } from './dom';
import {
  changeLines,
  changedPaths,
  clearSession,
  countBySection,
  DRAFT_KEY,
  draftFrom,
  exportedDraft,
  loadDraft,
  MAP_PATH,
  mapsDiffer,
  mergeDrafts,
  normalizeMap,
  rebaseDraft,
  sameDraft,
  saveLanded,
  stashSession,
  storeDraft,
  takeLegacyEditorMap,
  versionOf,
  withValue,
  type Draft,
  type StudioSession,
} from './draft';
import { FieldView, type FieldHost } from './fieldView';
import { searchFields } from './fields';
import { SaveError, exportTuning, saveTuning, type SaveEnv } from './save';
import { Stage } from './stage';
import { localStore, sessionStore } from './storage';
import { addStudioStyles } from './styles';

const MAP_TAB = 'map';
const HISTORY_TAB = 'history';
const BUILT_IN = DEFAULT_MAP.text;

type NoteKind = 'good' | 'warn' | 'bad' | 'info';
/** What a Save publishes: the draft as the Save dialog showed it. */
type SaveSnapshot = { values: Values; map: string | null };
interface NoteAction {
  label: string;
  run: () => void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pad = (n: number) => String(n).padStart(2, '0');

/** "12 Oct 2026, 14:02" (local time), or '' for a missing date. */
function when(iso: string | null | undefined): string {
  const day = shortDate(iso);
  if (!day) return '';
  const d = new Date(iso!);
  return `${day}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** What went wrong with a save, in plain English (save.ts words its errors for people already). `kept`: the draft is stored in this browser. */
function saveErrorText(e: SaveError, kept: boolean): string {
  const fallback: Record<SaveError['code'], string> = {
    conflict: 'Someone saved a newer version first. The page is reloading to it.',
    not_writer: 'Only the game’s owner (or an editor) can save it.',
    too_large: 'The game page is too big to save.',
    rate_limited: 'Too many saves just now. Wait a minute, then try again.',
    unsupported_page: 'This copy of the game can’t save itself.',
    unavailable: 'Saving isn’t available here.',
    failed: 'The save didn’t go through.',
  };
  const text = e.message.trim() || fallback[e.code];
  if (e.code !== 'conflict') return text;
  return `${text} ${kept ? 'Your draft is kept.' : 'This browser can’t keep your draft (its storage is blocked), so these changes are lost when it reloads.'}`;
}

/** Warns before saving when the draft can't be kept: a refused save reloads the page, and the changes would go with it. */
const UNKEPT_WARNING = 'This browser can’t keep the draft (its storage is blocked). If someone saved a newer version first, the page reloads to it and these changes are lost, so export them first to be safe.';

export class Studio {
  // ---- what is being edited
  private saved: TuningFile;
  private savedValues: Values;
  private draft!: Draft;
  private draftValues!: Values;
  private started = false;

  // ---- the page
  private state: 'closed' | 'open' | 'playing' = 'closed';
  private tab = SECTIONS[0].id;
  private query = '';
  private crew: string;
  private env: SaveEnv | null = knownSaveEnv();
  private readonly stage: Stage;
  private readonly host: FieldHost;
  private views: FieldView[] = [];
  private titles: { el: HTMLElement; group: FieldGroup }[] = [];
  private moreToggles: { button: HTMLButtonElement; list: HTMLElement; group: FieldGroup; fields: Field[] }[] = [];
  private readonly moreOpen = new Set<string>();
  private persistTimer = 0;
  private storageWarned = false;
  /** The draft as this tab last read it from the browser's storage or wrote it there (null: nothing stored). */
  private stored: Draft | null = null;
  /** The draft changed since this tab last stored it. */
  private dirty = false;
  /** ▶ Play was pressed before the art was drawn: the play test starts once it is. */
  private playQueued = false;
  private mapChecked: { text: string; errors: string[] } | null = null;

  // ---- elements (made on first open)
  private root!: HTMLElement;
  private main!: HTMLElement;
  private mapHost!: HTMLElement;
  private notes!: HTMLElement;
  private toasts!: HTMLElement;
  private search!: HTMLInputElement;
  private versionChip!: HTMLElement;
  private dirtyChip!: HTMLElement;
  private crewSelect!: HTMLSelectElement;
  private saveButton!: HTMLButtonElement;
  private moreButton!: HTMLButtonElement;
  private menu!: HTMLElement;
  private menuShield!: HTMLElement;
  private readonly tabs = new Map<string, { button: HTMLButtonElement; count: HTMLElement }>();

  constructor(
    game: Phaser.Game,
    saved: TuningFile,
    private session: StudioSession | null,
  ) {
    this.stage = new Stage(game);
    this.saved = saved;
    this.savedValues = valuesWith(saved.values);
    const pick = session?.crew || loadSave().character;
    this.crew = CHARACTERS[pick] ? pick : CHARACTER_ORDER[0];
    const studio = this;
    this.host = {
      get draft() {
        return studio.draftValues;
      },
      get saved() {
        return studio.savedValues;
      },
      shipped: DEFAULTS,
      set: (path, value, from) => this.setField(path, value, from),
    };
  }

  get isOpen(): boolean {
    return this.state === 'open';
  }

  get isPlaying(): boolean {
    return this.state === 'playing';
  }

  /** A copy of the draft (for tests and the console). */
  snapshot(): { draft: Draft; saved: TuningFile; unsaved: number } {
    if (!this.started) this.start();
    return { draft: structuredClone(this.draft), saved: structuredClone(this.saved), unsaved: this.unsavedCount() };
  }

  // ---- opening and closing ----------------------------------------------------------------

  /** Opens the Studio (on `tab` when given); from a play test, comes back. */
  open(tab?: string): void {
    if (!this.started) this.start();
    if (tab && this.isTab(tab)) {
      this.tab = tab;
      this.query = '';
      this.search.value = '';
    }
    if (this.state === 'playing') {
      this.backFromPlay();
      if (tab) this.render();
      return;
    }
    if (this.state === 'open') {
      if (tab) this.render();
      return;
    }
    this.state = 'open';
    this.stage.cover();
    setPlayTestLabel(null);
    this.root.hidden = false;
    this.refresh();
    this.render();
  }

  /** Back to the game, which runs the SAVED version again. The draft is kept for next time. */
  exit(): void {
    if (this.state === 'closed') return;
    this.stage.editor?.flush();
    this.persistNow();
    this.closeMenu();
    // Hand the keyboard back to the game: a control left focused in the hidden Studio (the menu's
    // Exit studio) would keep taking key presses, and the Studio keeps those from the game.
    if (document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement)) document.activeElement.blur();
    this.state = 'closed';
    this.root.hidden = true;
    this.root.querySelectorAll('.cs-layer').forEach((l) => l.remove());
    // A reload from now on is an ordinary one: back to the game, not the Studio.
    clearSession(sessionStore());
    setPlayTestLabel(null);
    applyTuning(this.saved);
    this.stage.uncover();
    // A reload shouldn't bring the Studio back when it was opened with #studio.
    if (/^#studio/i.test(location.hash)) {
      try {
        history.replaceState(null, '', location.pathname + location.search);
      } catch {
        // Sandboxed pages may not change their address: harmless.
      }
    }
  }

  /** Plays the draft: applies it to the game and starts a shift with the chosen crew member. */
  playTest(): void {
    if (this.state !== 'open') return;
    // The page can load straight into the Studio (after every save) while the art is still being
    // drawn: a shift started now would show missing-texture boxes until the end.
    if (!this.stage.artReady) {
      if (!this.playQueued) {
        this.playQueued = true;
        this.toast('Drawing the school… the play test starts in a moment.');
        this.stage.whenArtReady(() => {
          this.playQueued = false;
          this.playTest();
        });
      }
      return;
    }
    this.stage.editor?.flush();
    const problem = this.mapErrors()[0];
    if (problem) {
      this.toast(`The map can't be played yet: ${problem}`, 'bad', 6000);
      return;
    }
    unlockAudio();
    this.persistNow();
    this.closeMenu();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    applyTuning({ ...this.saved, note: 'Copper Studio draft', values: this.draft.values, map: this.draft.map, history: [] });
    const n = this.unsavedCount();
    setPlayTestLabel(n ? `Play test · draft, ${plural(n, 'unsaved change')}` : `Play test · same as v${this.saved.revision}`);
    this.state = 'playing';
    this.root.hidden = true;
    this.stage.play(this.crew, () => this.backFromPlay());
  }

  private backFromPlay(): void {
    if (this.state !== 'playing') return;
    this.stage.endPlay();
    this.stage.cover();
    setPlayTestLabel(null);
    this.state = 'open';
    this.root.hidden = false;
    this.refresh();
    if (this.onMapTab) this.showMap();
  }

  // ---- first open: the draft and the page ---------------------------------------------------

  private start(): void {
    this.started = true;
    const store = localStore();
    const stored = loadDraft(store, BUILT_IN);
    this.stored = stored;
    const notes: [string, NoteKind, string, NoteAction[]][] = [];
    if (stored) this.draft = stored;
    else {
      this.draft = draftFrom(this.saved, BUILT_IN);
      // The old in-game map editor kept its work in the browser: it becomes this draft's map.
      const legacy = takeLegacyEditorMap(store, BUILT_IN);
      if (legacy && mapsDiffer(legacy, this.draft.map, BUILT_IN)) {
        this.draft = { ...this.draft, map: legacy };
        notes.push(['legacy', 'info', 'The map you were editing in the old map editor is now in this draft (see the Map tab).', []]);
      }
    }
    this.draftValues = valuesWith(this.draft.values);
    this.build();

    const session = this.session;
    this.session = null;
    if (session?.tab && this.isTab(session.tab)) this.tab = session.tab;
    const saving = session?.saving;
    // A newer version than the draft's came from someone else (another tab, another device, Claude).
    let theirs = false;
    if (saving) {
      const rev = this.saved.revision;
      // Also after a "newer version" refusal: that version can be this save, when the answer to its
      // first try got lost on the way back.
      if (saveLanded(this.saved, saving)) {
        const where =
          saving.target === 'dev'
            ? 'It is in src/config/tuning.json (and the map file): commit them to keep it.'
            : 'Everyone who opens the game gets it now.';
        notes.push(['saved', 'good', `Saved as version ${saving.revision}. ${where}`, []]);
        // The draft is what was saved (plus any edits made since): it starts from that version now, its note used up.
        this.draft = { ...this.draft, baseRevision: Math.max(this.draft.baseRevision, saving.revision), note: '' };
      } else if (session.conflict || rev >= saving.revision) {
        theirs = true;
        if (!stored) notes.push(['saved', 'bad', `Someone saved version ${rev} first, and this browser couldn't keep your draft (its storage is blocked).`, []]);
      } else {
        notes.push(['saved', 'bad', `The save didn't arrive: the game is still on version ${rev}.${stored ? ' Your draft is kept, so you can save again.' : ''}`, []]);
      }
    }
    // The draft started from another version than the game runs now: someone saved since (in
    // another tab, on another device), or this is an older copy of the game.
    const base = this.draft.baseRevision;
    const rev = this.saved.revision;
    const startedFrom = base < rev ? versionOf(this.saved, base) : null;
    const startOver = { label: `Start over from version ${rev}`, run: () => void this.discardDraft() };
    if (startedFrom) {
      // Onto the newer version, keeping only the draft's own edits (else saving would undo theirs).
      const r = rebaseDraft(this.draft, startedFrom, this.saved, BUILT_IN);
      this.draft = r.draft;
      this.draftValues = valuesWith(this.draft.values);
      if (r.kept.length) {
        const lead = theirs ? `Someone saved version ${rev} while you were working.` : `Version ${rev} was saved after this draft was started (from version ${base}).`;
        const kept = r.kept.length === 1 ? 'Your edit is' : `Your ${r.kept.length} edits are`;
        const n = r.clashes.length;
        const clash = n ? ` Version ${rev} changed ${this.names(r.clashes)} too: yours ${n === 1 ? 'is' : 'are'} kept, so check ${n === 1 ? 'it' : 'them'}.` : '';
        notes.push(['newer', n ? 'warn' : 'info', `${lead} ${kept} kept on top of it.${clash}`, [startOver]]);
      }
    } else if (base !== rev) {
      if (this.unsavedCount() === 0) this.draft = { ...this.draft, baseRevision: rev };
      else if (base < rev) {
        // That version has left the history, so the draft's own edits can't be told apart.
        notes.push([
          'newer',
          'warn',
          `Version ${rev} was saved after this draft was started (from version ${base}), so everything marked unsaved differs from version ${rev}, not just your edits.`,
          [startOver, { label: 'Keep my draft', run: () => this.acceptBase() }],
        ]);
      } else {
        notes.push(['newer', 'warn', `This draft was started from version ${base}, but this copy of the game is on version ${rev}.`, [{ label: 'Keep my draft', run: () => this.acceptBase() }]]);
      }
    }
    for (const n of notes) this.note(...n);
    this.dirty = !stored || !sameDraft(stored, this.draft, BUILT_IN);
    this.persistNow();

    saveEnv().then((env) => {
      this.env = env;
      if (!env.canSave) {
        this.note('readonly', 'info', `${env.reason ?? 'Saving is off here.'} You can still change things and play test them.`, []);
      }
      if (this.root) this.refresh();
    });
  }

  /** "Mr. Gravy › Stats › Speed and the map" for field paths (and MAP_PATH), the first few of them. */
  private names(paths: string[]): string {
    const named = paths.map((p) => {
      const f = FIELD_BY_PATH.get(p);
      return p === MAP_PATH ? 'the map' : f ? `${f.where} › ${f.label}` : p;
    });
    const shown = named.length > 3 ? [...named.slice(0, 2), `${named.length - 2} more`] : named;
    return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0];
  }

  private acceptBase(): void {
    this.draft = { ...this.draft, baseRevision: this.saved.revision };
    this.dirty = true;
    this.persistNow();
    this.dropNote('newer');
  }

  private build(): void {
    addStudioStyles();
    this.versionChip = h('span', { class: 'cs-chip' });
    this.dirtyChip = h('span', { class: 'cs-chip', 'aria-live': 'polite' });
    this.crewSelect = h('select', { 'aria-label': 'Crew member for the play test', title: 'Who plays the play test' });
    this.crewSelect.addEventListener('change', () => (this.crew = this.crewSelect.value));
    // "▶ Play" on phones, where the header has room for little more than the buttons.
    const play = h(
      'button',
      { class: 'cs-btn', type: 'button', 'aria-label': 'Play test', title: 'Play a shift with the draft (nothing is saved)', onClick: () => this.playTest() },
      '▶ Play',
      h('span', { class: 'cs-wide' }, ' test'),
    );
    // "Save" on the narrowest phones, so the header's buttons stay on one row.
    this.saveButton = h('button', { class: 'cs-btn is-primary', type: 'button', onClick: () => this.openSave() }, 'Save', h('span', { class: 'cs-roomy' }, ' to game'));
    this.moreButton = h('button', { class: 'cs-btn is-icon', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'More', title: 'More', onClick: () => this.toggleMenu() }, '⋯');
    const item = (label: string, hint: string, run: () => void, danger = false) =>
      h(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          class: danger ? 'is-danger' : null,
          onClick: () => {
            this.closeMenu();
            run();
          },
        },
        label,
        h('small', null, hint),
      );
    this.menu = h(
      'div',
      { class: 'cs-menu', role: 'menu', hidden: true },
      item('Export…', 'Download or copy the draft as a tuning file', () => void this.exportDraft()),
      item('Import…', 'Load a tuning file into the draft', () => this.importDialog()),
      h('hr'),
      item('Reset everything to the shipped values', 'Every value and the map, in the draft', () => void this.resetAll(), true),
      item('Discard draft', 'Back to the saved version', () => void this.discardDraft(), true),
      h('hr'),
      item('Exit studio', 'Back to the game (the draft is kept)', () => this.exit()),
    );
    this.menu.addEventListener('keydown', (e) => this.menuKeys(e));
    // Under the open menu, over everything else: a press outside the menu only closes it (it would
    // paint the map on the Map tab). It closes on the click, so a tap's click lands on the shield too.
    this.menuShield = h('div', { class: 'cs-shield', hidden: true, 'aria-hidden': 'true' });
    this.menuShield.addEventListener('pointerdown', (e) => e.preventDefault());
    this.menuShield.addEventListener('click', () => this.toggleMenu(false));
    const menuWrap = h('div', { class: 'cs-menuwrap' }, this.moreButton, this.menu);
    const head = h(
      'header',
      { class: 'cs-head' },
      h('div', { class: 'cs-brand' }, h('span', { class: 'cs-logo' }, 'COPPER STUDIO'), this.versionChip, this.dirtyChip),
      // Save and the menu stay together: on the narrowest phones they wrap to a row of their own.
      h('div', { class: 'cs-actions' }, h('div', { class: 'cs-play' }, this.crewSelect, play), h('div', { class: 'cs-saveset' }, this.saveButton, menuWrap)),
    );

    this.search = h('input', { type: 'search', class: 'cs-search', placeholder: 'Search settings…', 'aria-label': 'Search settings', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search' });
    this.search.addEventListener('input', () => {
      this.query = this.search.value.trim();
      this.render();
    });
    this.search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.search.value) {
        this.search.value = '';
        this.query = '';
        this.render();
      }
    });
    const tabList = h('div', { class: 'cs-tabs', role: 'tablist', 'aria-label': 'Sections' });
    const addTab = (id: string, title: string) => {
      const count = h('span', { class: 'cs-count', hidden: true });
      const button = h('button', { class: 'cs-tab', type: 'button', role: 'tab', 'aria-selected': 'false', 'data-tab': id, onClick: () => this.setTab(id) }, title, count);
      this.tabs.set(id, { button, count });
      tabList.append(button);
    };
    for (const s of SECTIONS) addTab(s.id, s.title);
    tabList.append(h('div', { class: 'cs-tab-gap', role: 'presentation' }));
    addTab(MAP_TAB, 'Map');
    addTab(HISTORY_TAB, 'History');
    const nav = h('nav', { class: 'cs-nav' }, h('div', { class: 'cs-search-row' }, this.search), tabList);

    this.notes = h('div', { class: 'cs-notes' });
    this.main = h('main', { class: 'cs-main' });
    this.mapHost = h('div', { class: 'cs-maphost' }, h('p', null, 'Drawing the school…'));
    this.toasts = h('div', { class: 'cs-toasts', role: 'status', 'aria-live': 'polite' });
    this.root = h('div', { class: 'cs', hidden: true, 'aria-label': 'Copper Studio' }, head, this.notes, nav, this.main, this.mapHost, this.menuShield, this.toasts);
    // Keys pressed in the Studio are the Studio's: the game and the map editor never see them.
    for (const type of ['keydown', 'keyup', 'keypress']) this.root.addEventListener(type, (e) => e.stopPropagation());
    document.body.append(this.root);

    // The map editor's canvas follows the page area it shows in.
    const refit = () => {
      if (this.state === 'open' && this.onMapTab && this.stage.editor) this.stage.fitTo(this.mapHost);
    };
    new ResizeObserver(refit).observe(this.mapHost);
    window.addEventListener('resize', refit);
    window.addEventListener('pagehide', () => this.persistNow());
    // Another tab of the game stored the draft (the chat's preview and the shared link, say).
    window.addEventListener('storage', (e) => {
      if (this.started && e.key === DRAFT_KEY) this.takeOtherTabs();
    });
  }

  // ---- the draft ------------------------------------------------------------------------------

  private setField(path: string, value: unknown, from: FieldView): void {
    const next = withValue(this.draft, path, value);
    if (next === this.draft) {
      from.update();
      return;
    }
    this.draft = next;
    this.changed();
  }

  /** The map editor's map after an edit. */
  private setMap(text: string): void {
    const map = normalizeMap(text, BUILT_IN);
    if (map === this.draft.map) return;
    this.draft = { ...this.draft, map };
    this.changed();
  }

  /** Replaces the draft's values and map (history, import, reset, discard). */
  private replaceDraft(next: Draft, message?: string): void {
    const mapBefore = this.draft.map;
    this.draft = next;
    this.changed(true);
    const editor = this.stage.editor;
    if (editor && mapBefore !== next.map) editor.loadMap(next.map ?? BUILT_IN, 'The map changed with the draft. UNDO brings the old one back.');
    if (message) this.toast(message, 'good');
  }

  /** The draft changed. `wholesale`: not from a field on the page (the fields start over, notes and all). */
  private changed(wholesale = false): void {
    this.draftValues = valuesWith(this.draft.values);
    this.dirty = true;
    this.persistSoon();
    this.refresh(wholesale);
  }

  private persistSoon(): void {
    clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => this.persistNow(), 300);
  }

  /**
   * Stores the draft in this browser when it changed, after taking in what another tab stored
   * meanwhile (so neither tab's edits are lost). False when the browser won't keep it.
   */
  private persistNow(): boolean {
    clearTimeout(this.persistTimer);
    if (!this.started) return false;
    if (!this.dirty) return this.stored !== null;
    const store = localStore();
    this.takeOtherTabs(store);
    if (!storeDraft(store, this.draft, new Date().toISOString())) {
      if (!this.storageWarned) {
        this.storageWarned = true;
        this.note('storage', 'warn', 'This browser won’t keep the draft between visits (its storage is blocked). Save or Export before you close the page.', []);
      }
      return false;
    }
    this.stored = this.draft;
    this.dirty = false;
    return true;
  }

  /** Another tab stored the draft since this one last read or wrote it: their edits come in, this tab's stay on top. */
  private takeOtherTabs(store = localStore()): void {
    const theirs = loadDraft(store, BUILT_IN);
    if (!theirs || (this.stored && sameDraft(theirs, this.stored, BUILT_IN))) return;
    // The map editor's latest strokes belong to this tab's edits.
    this.stage.editor?.flush();
    const base = this.stored ?? draftFrom(this.saved, BUILT_IN);
    const mine = !sameDraft(this.draft, base, BUILT_IN);
    const merged = mergeDrafts(base, this.draft, theirs, BUILT_IN);
    this.stored = theirs;
    this.dirty = !sameDraft(merged, theirs, BUILT_IN);
    if (sameDraft(merged, this.draft, BUILT_IN)) return;
    const mapBefore = this.draft.map;
    this.draft = merged;
    this.draftValues = valuesWith(merged.values);
    // Not wholesale: a box being typed in keeps what is typed (its value is this tab's, so it stays).
    this.refresh();
    const editor = this.stage.editor;
    if (editor && mapsDiffer(mapBefore, merged.map, BUILT_IN)) editor.loadMap(merged.map ?? BUILT_IN, 'Another tab changed the map. UNDO brings this one back.');
    this.note('tabs', 'info', mine ? 'This draft was changed in another tab too: its edits are in here now, and yours are kept.' : 'This draft was changed in another tab: its edits are in here now.', []);
    if (this.dirty) this.persistSoon();
  }

  private unsavedCount(): number {
    return changedPaths(this.draftValues, this.savedValues).length + (this.mapChanged() ? 1 : 0);
  }

  private mapChanged(): boolean {
    return mapsDiffer(this.draft.map, this.saved.map, BUILT_IN);
  }

  /** What stops the draft's map (or `text`) from being played or saved. */
  private mapErrors(text = this.draft.map): string[] {
    if (text === null) return [];
    if (this.mapChecked?.text !== text) this.mapChecked = { text, errors: validateMap(parseMap(text)).errors };
    return this.mapChecked.errors;
  }

  // ---- drawing ---------------------------------------------------------------------------------

  private isTab(id: string): boolean {
    return id === MAP_TAB || id === HISTORY_TAB || SECTIONS.some((s) => s.id === id);
  }

  private get onMapTab(): boolean {
    return this.tab === MAP_TAB && !this.query;
  }

  private setTab(id: string): void {
    this.tab = id;
    this.query = '';
    this.search.value = '';
    this.render();
    // On the map, the keyboard belongs to the editor (pan, zoom, undo).
    if (id === MAP_TAB && document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement)) document.activeElement.blur();
  }

  private groupTitle(group: FieldGroup): string {
    const name = group.titlePath ? getPath(this.draftValues, group.titlePath) : undefined;
    return typeof name === 'string' && name.trim() ? name : group.title;
  }

  /** Header, counts and every setting on the page, after the draft changed. */
  private refresh(wholesale = false): void {
    if (!this.root) return;
    const paths = changedPaths(this.draftValues, this.savedValues);
    const mapChanged = this.mapChanged();
    const count = paths.length + (mapChanged ? 1 : 0);
    const rev = this.saved.revision;
    // Phones show the short forms ("v0 · shipped", "2 unsaved"): .cs-wide parts hide there, and
    // .cs-roomy ones on the narrowest ("v3", its date in the tooltip).
    const wide = (text: string) => h('span', { class: 'cs-wide' }, text);
    const day = rev ? shortDate(this.saved.savedAt) : '';
    this.versionChip.replaceChildren(wide('Live '), h('b', null, `v${rev}`), h('span', { class: 'cs-roomy' }, ' · ', rev ? day || 'saved' : h('span', null, 'shipped', wide(' values'))));
    this.versionChip.title = rev
      ? `The version the game runs now${day ? `, saved ${day}` : ''}${this.saved.note ? `: “${this.saved.note}”` : ''}`
      : 'The game runs the values its code ships with';
    this.versionChip.dataset.revision = String(rev);
    this.dirtyChip.classList.toggle('is-dirty', count > 0);
    this.dirtyChip.dataset.unsaved = String(count);
    this.dirtyChip.replaceChildren(
      ...(count
        ? [h('b', null, String(count)), ' unsaved', wide(` change${count === 1 ? '' : 's'}`)]
        : [wide('No unsaved changes'), h('span', { class: 'cs-narrow' }, 'All saved')]),
    );

    const bySection = countBySection(paths);
    for (const [id, { count: badge }] of this.tabs) {
      const n = id === MAP_TAB ? (mapChanged ? 1 : 0) : (bySection[id] ?? 0);
      badge.hidden = n === 0;
      badge.textContent = id === MAP_TAB ? '•' : String(n);
      badge.title = id === MAP_TAB ? 'The map has unsaved changes' : `${plural(n, 'unsaved change')}`;
    }
    for (const v of this.views) v.update(wholesale);
    for (const t of this.titles) t.el.textContent = this.groupTitle(t.group);
    for (const m of this.moreToggles) this.paintMore(m);

    // Crew names follow the draft (a renamed crew member).
    const names = CHARACTER_ORDER.map((id) => {
      const name = getPath(this.draftValues, `characters.${id}.name`);
      return [id, typeof name === 'string' ? name : id] as const;
    });
    if (this.crewSelect.options.length !== names.length) this.crewSelect.replaceChildren(...names.map(([id, name]) => h('option', { value: id }, name)));
    names.forEach(([, name], i) => (this.crewSelect.options[i].textContent = name));
    this.crewSelect.value = this.crew;

    const env = this.env;
    this.saveButton.disabled = !env?.canSave || count === 0;
    this.saveButton.title = !env
      ? 'Checking where saves go…'
      : !env.canSave
        ? (env.reason ?? 'Saving is not possible here')
        : count === 0
          ? 'No unsaved changes'
          : env.target === 'dev'
            ? 'Write the draft into the project (src/config/tuning.json and the map file)'
            : 'Publish the draft: everyone who opens the game gets it';
  }

  /** Builds the page for the current tab or search. */
  private render(): void {
    this.views = [];
    this.titles = [];
    this.moreToggles = [];
    for (const [id, { button }] of this.tabs) button.setAttribute('aria-selected', String(id === this.tab && !this.query));
    const onMap = this.onMapTab;
    this.root.classList.toggle('is-map', onMap);
    if (onMap) {
      this.main.replaceChildren();
      this.showMap();
      return;
    }
    this.stage.hideEditor();
    const section = SECTIONS.find((s) => s.id === this.tab);
    const page = this.query ? this.renderSearch() : section ? this.renderSection(section) : this.renderHistory();
    this.main.replaceChildren(page);
    this.main.scrollTop = 0;
  }

  private showMap(): void {
    const label = this.mapHost.querySelector('p');
    const ready = this.stage.artReady;
    if (label) label.textContent = ready ? '' : 'Drawing the school…';
    // Until the art is drawn the canvas still shows the game's own loading screen: cover it.
    this.mapHost.classList.toggle('is-waiting', !ready);
    // After layout, so the canvas lands exactly on the page area.
    requestAnimationFrame(() =>
      this.stage.whenArtReady(() => {
        if (this.state !== 'open' || !this.onMapTab) return;
        if (label) label.textContent = '';
        this.mapHost.classList.remove('is-waiting');
        this.stage.showEditor(this.mapHost, () => this.editorLink());
      }),
    );
  }

  private editorLink(): EditorLink {
    return {
      map: this.draft.map ?? BUILT_IN,
      onChange: (text) => this.setMap(text),
      // Asked from inside the editor's input handling: switch scenes once that is done.
      onPlay: () => setTimeout(() => this.playTest(), 0),
      isBlocked: () => this.covered,
    };
  }

  private renderSection(section: Section): HTMLElement {
    const page = h('div', { class: 'cs-page' }, h('h1', { class: 'cs-h1' }, section.title), h('p', { class: 'cs-blurb' }, section.blurb));
    for (const group of section.groups) page.append(this.renderGroup(group, group.fields, null));
    return page;
  }

  /** A group's card. In search results (`crumb` set) every matching field shows, advanced or not. */
  private renderGroup(group: FieldGroup, fields: Field[], crumb: string | null): HTMLElement {
    const title = h('h2', { class: 'cs-h2' }, this.groupTitle(group));
    this.titles.push({ el: title, group });
    const card = h(
      'article',
      { class: 'cs-card', 'data-group': group.id },
      h('div', { class: 'cs-card-head' }, crumb ? h('div', { class: 'cs-crumb' }, crumb) : null, title, group.help ? h('p', { class: 'cs-card-help' }, group.help) : null),
    );
    const basic = crumb ? fields : fields.filter((f) => !f.advanced);
    const advanced = crumb ? [] : fields.filter((f) => f.advanced);
    if (basic.length) card.append(this.fieldList(basic));
    if (advanced.length) {
      const list = this.fieldList(advanced);
      // Closed until opened, even in a group of only rarely needed settings (its title and help still show).
      const open = this.moreOpen.has(group.id);
      list.hidden = !open;
      const button = h('button', { class: 'cs-btn cs-more', type: 'button', 'aria-expanded': String(open) });
      const more = { button, list, group, fields: advanced };
      button.addEventListener('click', () => {
        const show = list.hidden;
        list.hidden = !show;
        if (show) this.moreOpen.add(group.id);
        else this.moreOpen.delete(group.id);
        this.paintMore(more);
      });
      this.moreToggles.push(more);
      this.paintMore(more);
      card.append(button, list);
    }
    return card;
  }

  private paintMore(m: { button: HTMLButtonElement; list: HTMLElement; fields: Field[] }): void {
    const open = !m.list.hidden;
    const unsaved = m.fields.some((f) => JSON.stringify(getPath(this.draftValues, f.path) ?? null) !== JSON.stringify(getPath(this.savedValues, f.path) ?? null));
    m.button.setAttribute('aria-expanded', String(open));
    m.button.replaceChildren(
      h('span', null, open ? 'Fewer settings' : `More settings (${m.fields.length})`, unsaved && !open ? h('span', { class: 'cs-dot', title: 'Has unsaved changes' }) : null),
      h('span', { 'aria-hidden': 'true' }, open ? '▴' : '▾'),
    );
  }

  private fieldList(fields: Field[]): HTMLElement {
    return h(
      'div',
      { class: 'cs-fields' },
      fields.map((f) => {
        const view = new FieldView(f, this.host);
        this.views.push(view);
        return view.root;
      }),
    );
  }

  private renderSearch(): HTMLElement {
    const hits = searchFields(this.query, (g) => this.groupTitle(g));
    const page = h(
      'div',
      { class: 'cs-page' },
      h('h1', { class: 'cs-h1' }, 'Search'),
      h('p', { class: 'cs-blurb' }, hits.length ? `${plural(hits.length, 'setting')} ${hits.length === 1 ? 'matches' : 'match'} “${this.query}”.` : `Nothing matches “${this.query}”. Try one word, like “speed” or “price”.`),
    );
    const groups = new Map<string, { section: Section; group: FieldGroup; fields: Field[] }>();
    for (const hit of hits) {
      const entry = groups.get(hit.group.id) ?? { section: hit.section, group: hit.group, fields: [] };
      entry.fields.push(hit.field);
      groups.set(hit.group.id, entry);
    }
    for (const { section, group, fields } of groups.values()) page.append(this.renderGroup(group, fields, section.title));
    return page;
  }

  private renderHistory(): HTMLElement {
    const page = h(
      'div',
      { class: 'cs-page' },
      h('h1', { class: 'cs-h1' }, 'History'),
      h('p', { class: 'cs-blurb' }, 'Every save is a new version. Load one into the draft to look at it again or to go back to it; nothing changes in the game until you Save to game.'),
    );
    const card = h('article', { class: 'cs-card' });
    const history = this.saved.history;
    if (!history.length) card.append(h('div', { class: 'cs-hist' }, h('p', { class: 'cs-hist-note is-empty' }, 'No saves yet: the first one becomes version 1.')));
    for (const entry of history) {
      card.append(
        this.historyItem(`Version ${entry.revision}`, entry.revision === this.saved.revision, when(entry.savedAt), entry.note, entry.changes, () =>
          void this.loadVersion(`version ${entry.revision}`, entry.values, entry.map),
        ),
      );
    }
    card.append(
      this.historyItem('Shipped values (v0)', this.saved.revision === 0, 'What the game’s code comes with', '', [], () => void this.loadVersion('the shipped values', {}, null)),
    );
    page.append(card);
    return page;
  }

  private historyItem(title: string, live: boolean, date: string, note: string, changes: string[], load: () => void): HTMLElement {
    const shown = 8;
    const list = h('ul', { class: 'cs-changes' }, changes.slice(0, shown).map((c) => h('li', null, c)));
    if (changes.length > shown) {
      const more = h('button', { class: 'cs-link', type: 'button' }, `Show all ${changes.length} changes`);
      more.addEventListener('click', () => list.replaceChildren(...changes.map((c) => h('li', null, c))));
      list.append(h('li', null, more));
    }
    return h(
      'div',
      { class: 'cs-hist' },
      h(
        'div',
        { class: 'cs-hist-top' },
        h('span', { class: 'cs-hist-ver' }, title),
        live ? h('span', { class: 'cs-badge' }, 'Live now') : null,
        date ? h('span', { class: 'cs-hist-date' }, date) : null,
        h('button', { class: 'cs-btn', type: 'button', onClick: load }, 'Load into draft'),
      ),
      title.startsWith('Shipped') ? null : h('p', { class: `cs-hist-note${note ? '' : ' is-empty'}` }, note || 'No note'),
      changes.length ? list : null,
    );
  }

  // ---- notices and toasts ---------------------------------------------------------------------

  /** A notice under the header (one per id: a new one replaces it). */
  private note(id: string, kind: NoteKind, text: string, actions: NoteAction[]): void {
    this.dropNote(id);
    const close = h('button', { class: 'cs-btn is-icon', type: 'button', 'aria-label': 'Dismiss', title: 'Dismiss', onClick: () => this.dropNote(id) }, '×');
    const el = h(
      'div',
      { class: `cs-note is-${kind}`, 'data-note': id, role: kind === 'bad' || kind === 'warn' ? 'alert' : 'status' },
      h('span', null, text),
      actions.map((a) => h('button', { class: 'cs-btn', type: 'button', onClick: a.run }, a.label)),
      close,
    );
    this.notes.append(el);
  }

  private dropNote(id: string): void {
    this.notes.querySelector(`[data-note="${id}"]`)?.remove();
  }

  private toast(text: string, kind: 'good' | 'bad' | '' = '', ms = 3600): void {
    const t = h('div', { class: `cs-toast${kind ? ` is-${kind}` : ''}` }, text);
    this.toasts.append(t);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    setTimeout(() => t.remove(), ms);
  }

  /** A dialog over the Studio. Toasts still showing go: on a phone they'd sit on its buttons. */
  private dialog(opts: Parameters<typeof openDialog>[1]): Dialog {
    this.toasts.replaceChildren();
    return openDialog(this.root, opts);
  }

  private ask(...args: Parameters<typeof confirmDialog> extends [HTMLElement, ...infer Rest] ? Rest : never): Promise<boolean> {
    this.toasts.replaceChildren();
    return confirmDialog(this.root, ...args);
  }

  // ---- the More menu ----------------------------------------------------------------------------

  private toggleMenu(open = this.menu.hidden): void {
    this.menu.hidden = !open;
    this.menuShield.hidden = !open;
    this.moreButton.setAttribute('aria-expanded', String(open));
    if (open) this.menu.querySelector('button')?.focus();
  }

  private closeMenu(): void {
    if (this.menu && !this.menu.hidden) this.toggleMenu(false);
  }

  /** A dialog or the ⋯ menu is up: the map editor behind it leaves keys and presses alone. */
  private get covered(): boolean {
    return (this.menu && !this.menu.hidden) || this.root?.querySelector(':scope > .cs-layer') != null;
  }

  private menuKeys(e: KeyboardEvent): void {
    const items = [...this.menu.querySelectorAll('button')];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      this.toggleMenu(false);
      this.moreButton.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }
  }

  // ---- saving ----------------------------------------------------------------------------------------

  private openSave(): void {
    const env = this.env;
    if (!env?.canSave) {
      this.toast(env?.reason ?? 'Still checking where saves go…', 'bad');
      return;
    }
    this.stage.editor?.flush();
    // Save publishes exactly what this dialog lists and checked: an edit made while it is open (in
    // another tab, say) waits for the next save.
    const snap: SaveSnapshot = { values: this.draftValues, map: this.draft.map };
    const lines = changeLines({ values: this.savedValues, map: this.saved.map }, snap, BUILT_IN);
    const errors = this.mapErrors(snap.map);
    const kept = this.persistNow();
    const revision = this.saved.revision + 1;
    const note = h('textarea', { class: 'cs-note-input', id: 'cs-save-note', rows: 3, maxlength: 500, placeholder: 'What changed? e.g. Gravy slower — testers said he’s too fast' });
    note.value = this.draft.note;
    note.addEventListener('input', () => this.setNote(note.value, false));
    const where =
      env.target === 'dev'
        ? 'This writes the draft into the project: src/config/tuning.json, and the map into src/assets/maps/lincoln.txt. Commit them to keep it.'
        : 'The game is published again with these values: everyone who opens the link gets them, and copies that are open reload.';
    const status = h('div');
    const body: Child[] = [
      h('p', null, where),
      h('div', null, h('label', { class: 'cs-flabel', for: 'cs-save-note' }, 'Note for this version'), note),
      h('div', null, h('div', { class: 'cs-flabel' }, `${plural(lines.length, 'change')} from version ${this.saved.revision}`), h('ul', { class: 'cs-changes' }, lines.map((l) => h('li', null, l)))),
      errors.length
        ? h(
            'div',
            { class: 'cs-box is-bad' },
            'The map can’t be saved until these are fixed (Map tab):',
            h(
              'ul',
              null,
              errors.slice(0, 6).map((e) => h('li', null, e)),
            ),
          )
        : null,
      kept
        ? null
        : h('div', { class: 'cs-box is-warn' }, `${UNKEPT_WARNING} `, h('button', { class: 'cs-link', type: 'button', onClick: () => void this.exportDraft() }, 'Export the draft')),
      status,
    ];
    const dialog: Dialog = this.dialog({
      title: `Save to game — version ${revision}`,
      body,
      actions: [
        { label: 'Cancel' },
        { label: `Save as version ${revision}`, kind: 'primary', disabled: errors.length > 0 || lines.length === 0, run: () => this.save(snap, note.value, status, env, dialog) },
      ],
    });
  }

  /** The note for the next save. `now`: stored at once (else with the next store). */
  private setNote(text: string, now: boolean): void {
    if (text === this.draft.note) return;
    this.draft = { ...this.draft, note: text };
    this.dirty = true;
    if (now) this.persistNow();
    else this.persistSoon();
  }

  /** Resolves false to keep the dialog open; never resolves while the page reloads. */
  private async save(snap: SaveSnapshot, noteText: string, status: HTMLElement, env: SaveEnv, dialog: Dialog): Promise<boolean> {
    const file = makeSave({ values: snap.values, map: snap.map, note: noteText, previous: this.saved, now: new Date().toISOString(), builtInMap: BUILT_IN });
    this.setNote(noteText, true);
    // Whether the draft is in this browser's storage, so that a reload can't lose it.
    const kept = this.persistNow();
    // The page reloads after a save: this brings the Studio back, saying how it went. The save's
    // time tells it apart from anyone else's version with the same number.
    const session: StudioSession = { tab: this.tab, crew: this.crew, saving: { revision: file.revision, target: env.target, savedAt: file.savedAt ?? undefined }, at: Date.now() };
    stashSession(sessionStore(), session);
    status.replaceChildren(h('div', { class: 'cs-box' }, `Saving version ${file.revision}…`));
    /** The page reloads to the latest version: claude.ai does it, on the dev server we do. Never resolves. */
    const reloading = (text: string, kind: 'good' | 'bad') => {
      status.replaceChildren(h('div', { class: `cs-box is-${kind}` }, text));
      if (env.target === 'dev') location.reload();
      // Offer a way on if the reload doesn't come.
      setTimeout(() => status.append(h('p', null, 'Still here? ', h('button', { class: 'cs-link', type: 'button', onClick: () => location.reload() }, 'Reload now'))), 8000);
      return new Promise<boolean>(() => {});
    };
    try {
      const result = await saveTuning(file, env);
      if (result.reloads) return reloading(`Saved as version ${file.revision}. Reloading…`, 'good');
      // Saved without a reload: this page now runs the new version.
      clearSession(sessionStore());
      this.adoptSaved(file);
      this.toast(`Saved as version ${file.revision}.`, 'good');
      return true;
    } catch (e) {
      const err = e instanceof SaveError ? e : new SaveError('failed', e instanceof Error ? e.message : String(e));
      if (err.code === 'conflict') {
        // A newer version was saved first: reload to it, keeping the draft (in localStorage, when the
        // browser allows). The stash still names this save: the newer version may be this very save.
        stashSession(sessionStore(), { ...session, conflict: true });
        return reloading(saveErrorText(err, kept), 'bad');
      }
      // Without an answer the save may still land and reload the page: the stash then says how it went.
      if (!err.uncertain) clearSession(sessionStore());
      status.replaceChildren(h('div', { class: 'cs-box is-bad' }, saveErrorText(err, kept)));
      dialog.buttons[1]?.focus();
      return false;
    }
  }

  private adoptSaved(file: TuningFile): void {
    this.saved = file;
    this.savedValues = valuesWith(file.values);
    this.draft = { ...this.draft, baseRevision: file.revision, note: '' };
    this.dirty = true;
    this.dropNote('newer');
    this.persistNow();
    this.refresh();
    if (this.tab === HISTORY_TAB && !this.query) this.render();
  }

  // ---- export, import, reset, discard, history -----------------------------------------------------

  /**
   * Hands over the draft as a tuning file. With unsaved changes it is marked as a draft (it isn't a
   * version); without, it is the saved version itself, history and all (what pull takes in).
   */
  private async exportDraft(): Promise<void> {
    this.stage.editor?.flush();
    const unsaved = this.unsavedCount() > 0;
    const file = unsaved ? exportedDraft(this.draft, this.saved, new Date().toISOString()) : this.saved;
    const what = unsaved ? 'the draft' : `version ${this.saved.revision}`;
    let how: 'downloaded' | 'copied' | 'shown' = 'shown';
    try {
      how = await exportTuning(file);
    } catch {
      how = 'shown';
    }
    if (how === 'downloaded') this.toast(`Downloaded ${what} as a tuning file.`, 'good');
    else if (how === 'copied') this.toast(`Copied ${what} as a tuning file. Paste it anywhere to keep or send it.`, 'good');
    else this.showExport(stringifyTuning(file));
  }

  private showExport(text: string): void {
    const area = h('textarea', { class: 'cs-code', readonly: true, spellcheck: 'false', 'aria-label': 'Tuning file', rows: 12 });
    area.value = text;
    area.addEventListener('focus', () => {
      area.select();
      // Selecting scrolls to the end; the start of the file is the part worth seeing.
      requestAnimationFrame(() => (area.scrollTop = 0));
    });
    const hint = h('p', null, 'Copy this text to keep it, or send it to whoever looks after the game. Import loads it back into a draft.');
    this.dialog({
      title: 'Export the draft',
      body: [hint, area],
      actions: [
        { label: 'Close' },
        {
          label: 'Copy',
          kind: 'primary',
          run: async () => {
            const ok = await copyText(text, area);
            hint.textContent = ok ? 'Copied!' : 'Select the text and copy it: Ctrl+C (Cmd+C on a Mac), or press and hold on a phone.';
            return false;
          },
        },
      ],
    });
    area.focus();
  }

  private importDialog(): void {
    const area = h('textarea', { class: 'cs-code', spellcheck: 'false', rows: 10, placeholder: '{ "format": "copper-tuning", … }', 'aria-label': 'Tuning file to import' });
    const picker = h('input', { type: 'file', accept: '.json,application/json,text/plain' });
    const report = h('div');
    let parsed: TuningFile | null = null;
    const dialog = this.dialog({
      title: 'Import a tuning file',
      body: [
        h('p', null, 'Paste a tuning file (from Export, or a copy of src/config/tuning.json). It replaces the draft’s values and map; nothing reaches the game until you Save to game.'),
        area,
        h('label', { class: 'cs-flabel' }, 'Or open a file: ', picker),
        report,
      ],
      actions: [
        { label: 'Cancel' },
        {
          label: 'Load into draft',
          kind: 'primary',
          disabled: true,
          run: () => {
            if (!parsed) return false;
            const label = parsed.draftOf !== undefined ? `the draft started from version ${parsed.draftOf}` : parsed.revision ? `version ${parsed.revision}` : 'the file';
            this.replaceDraft({ ...this.draft, values: parsed.values, map: normalizeMap(parsed.map, BUILT_IN) }, `Imported ${label} into the draft. Save to game makes it live.`);
            return true;
          },
        },
      ],
    });
    const load = dialog.buttons[1];
    const check = () => {
      parsed = null;
      load.disabled = true;
      report.replaceChildren();
      const text = area.value.trim();
      if (!text) return;
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        report.append(h('div', { class: 'cs-box is-bad' }, 'That isn’t a tuning file: it isn’t valid JSON. Copy all of it, from the first { to the last }.'));
        return;
      }
      if (!isObject(raw) || (raw.format !== 'copper-tuning' && !isObject(raw.values))) {
        report.append(h('div', { class: 'cs-box is-bad' }, 'That JSON isn’t a tuning file (it has no "values").'));
        return;
      }
      const { file, warnings } = parseTuning(text);
      parsed = file;
      const diff = changeLines({ values: this.draftValues, map: this.draft.map }, { values: valuesWith(file.values), map: file.map }, BUILT_IN);
      const about = [
        file.draftOf !== undefined ? `A draft started from version ${file.draftOf}` : file.revision ? `Version ${file.revision}` : 'A tuning file',
        file.draftOf !== undefined ? (file.exportedAt ? `, exported ${when(file.exportedAt)}` : '') : file.savedAt ? `, saved ${when(file.savedAt)}` : '',
        file.note ? `: “${file.note}”` : '',
        '. ',
      ].join('');
      report.append(h('div', { class: 'cs-box is-good' }, `${about}${diff.length ? `${plural(diff.length, 'change')} from your draft.` : 'It is the same as your draft.'}`));
      if (warnings.length) {
        report.append(
          h(
            'div',
            { class: 'cs-box is-warn' },
            'Some of it was left out or adjusted:',
            h(
              'ul',
              null,
              warnings.slice(0, 12).map((w) => h('li', null, w)),
            ),
          ),
        );
      }
      load.disabled = false;
    };
    area.addEventListener('input', check);
    picker.addEventListener('change', async () => {
      const f = picker.files?.[0];
      if (!f) return;
      area.value = await f.text();
      check();
    });
  }

  private async loadVersion(label: string, values: Overrides, map: string | null): Promise<void> {
    const n = this.unsavedCount();
    if (n > 0) {
      const ok = await this.ask(`Load ${label}?`, [h('p', null, `The draft’s values and map become ${label}’s, replacing your ${plural(n, 'unsaved change')}.`)], 'Load into draft');
      if (!ok) return;
    }
    this.replaceDraft({ ...this.draft, values: checkOverrides(values).values, map: normalizeMap(map, BUILT_IN) }, `Loaded ${label} into the draft. Save to game makes it live.`);
  }

  private async resetAll(): Promise<void> {
    const ok = await this.ask(
      'Reset everything?',
      [h('p', null, 'Every value and the map go back to what the game ships with. Only the draft changes: the game keeps its saved version until you Save to game.')],
      'Reset everything',
      'danger',
    );
    if (ok) this.replaceDraft({ ...this.draft, values: {}, map: null }, 'The draft is back to the shipped values.');
  }

  private async discardDraft(): Promise<void> {
    const n = this.unsavedCount();
    const rev = this.saved.revision;
    if (n > 0) {
      const ok = await this.ask('Discard the draft?', [h('p', null, `Your ${plural(n, 'unsaved change')} will be thrown away, and the draft goes back to version ${rev}, the one the game runs now.`)], 'Discard draft', 'danger');
      if (!ok) return;
    }
    this.replaceDraft(draftFrom(this.saved, BUILT_IN), `The draft is back to version ${rev}.`);
    this.dropNote('newer');
  }
}
