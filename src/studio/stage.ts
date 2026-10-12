// What the game canvas does while Copper Studio is up: nothing (the Studio covers it), the map
// editor (Map tab: the canvas is moved under the Studio's header), or a play test (full screen,
// with a floating "◀ STUDIO" button to come back).
//
// Scene changes asked for from inside a Phaser input handler (the menu's STUDIO button, the
// editor's PLAY) are deferred by the caller: these calls act at once.

import Phaser from 'phaser';
import type { EditorLink, EditorScene } from '../scenes/EditorScene';
import { h } from './dom';
import { ART_READY, HUD_LAYOUT, STUDIO_OPEN, type HudLayout } from './hooks';
import { topCentreSpot } from './spot';

/** The scenes that make up the game itself (Boot finishes on its own; the editor is handled apart). */
const GAME_SCENES = ['Menu', 'Game', 'Hud', 'ShiftEnd'];
const EDITOR = 'Editor';

export class Stage {
  private back: HTMLButtonElement | null = null;
  private onBack: (() => void) | null = null;
  /** The Studio is showing over the game (not during a play test). */
  private covered = false;

  constructor(private readonly game: Phaser.Game) {
    // The Studio may open before the art is drawn; once it is, the loop can rest under it.
    game.events.on(ART_READY, () => this.rest());
  }

  /** The element the canvas lives in (#game). */
  private get frame(): HTMLElement | null {
    return (this.game.scale.parent as HTMLElement | null) ?? document.getElementById('game');
  }

  get artReady(): boolean {
    return this.game.registry.get(ART_READY) === true;
  }

  /** Runs `fn` once the art is drawn (straight away if it is). */
  whenArtReady(fn: () => void): void {
    if (this.artReady) fn();
    else this.game.events.once(ART_READY, fn);
  }

  /** Started and not stopped (sleeping and paused count). */
  private live(key: string): boolean {
    const status = this.game.scene.getScene(key)?.sys.settings.status;
    return status !== undefined && status >= Phaser.Scenes.START && status <= Phaser.Scenes.SLEEPING;
  }

  private stopGame(): void {
    for (const key of GAME_SCENES) if (this.live(key)) this.game.scene.stop(key);
  }

  /**
   * Nothing shows on the canvas: stop drawing frames until something does (spares phone batteries
   * and keeps the Studio's scrolling smooth). Boot needs frames until the art is drawn.
   */
  private rest(): void {
    const editor = this.editor;
    if (!this.covered || !this.artReady || (editor && !editor.sys.isSleeping())) return;
    this.game.loop.sleep();
  }

  /** Frames again, without a jump in game time for the time spent resting. */
  private run(): void {
    const loop = this.game.loop;
    if (loop.running) return;
    loop.wake();
    loop.resetDelta();
  }

  /** The Studio is up: the game stops underneath it (and Boot won't open the menu). */
  cover(): void {
    this.covered = true;
    this.game.registry.set(STUDIO_OPEN, true);
    this.hideBack();
    this.stopGame();
    this.rest();
  }

  /** The Studio is gone: back to the game's menu (Boot opens it if the art isn't drawn yet). */
  uncover(): void {
    this.covered = false;
    this.run();
    this.game.registry.set(STUDIO_OPEN, false);
    this.hideBack();
    this.stopEditor();
    this.stopGame();
    this.fullScreen();
    if (this.artReady) this.game.scene.start('Menu');
  }

  // ---- the map editor -------------------------------------------------------------------

  /** The editor scene, while it is started (running or asleep). */
  get editor(): EditorScene | null {
    return this.live(EDITOR) ? (this.game.scene.getScene(EDITOR) as EditorScene) : null;
  }

  /** Shows the map editor over `host`: wakes it, or starts it with `link()`. */
  showEditor(host: HTMLElement, link: () => EditorLink): void {
    this.run();
    this.fitTo(host);
    const editor = this.editor;
    if (!editor) this.game.scene.start(EDITOR, { link: link() });
    else if (editor.sys.isSleeping()) this.game.scene.wake(EDITOR);
  }

  /** Puts the editor to sleep (its map, undo steps and view are kept for next time). */
  hideEditor(): void {
    const editor = this.editor;
    if (editor) {
      editor.flush();
      if (!editor.sys.isSleeping()) this.game.scene.sleep(EDITOR);
    }
    this.rest();
  }

  stopEditor(): void {
    const editor = this.editor;
    if (!editor) return;
    editor.flush();
    this.game.scene.stop(EDITOR);
  }

  /** Lays the canvas exactly over `host` (the Studio's page area). */
  fitTo(host: HTMLElement): void {
    const frame = this.frame;
    if (!frame) return;
    const r = host.getBoundingClientRect();
    Object.assign(frame.style, { top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px`, right: 'auto', bottom: 'auto' });
    this.refreshScale();
  }

  /** The canvas fills the screen again, the way the page's own style lays it out. */
  fullScreen(): void {
    const frame = this.frame;
    if (!frame) return;
    for (const p of ['top', 'left', 'width', 'height', 'right', 'bottom']) frame.style.removeProperty(p);
    this.refreshScale();
  }

  private refreshScale(): void {
    const scale = this.game.scale;
    if (scale.getParentBounds()) scale.refresh();
  }

  // ---- play tests -------------------------------------------------------------------------

  /** Starts a shift full screen, with the floating button that calls `onBack`. */
  play(character: string, onBack: () => void): void {
    this.covered = false;
    this.run();
    this.hideEditor();
    this.fullScreen();
    this.stopGame();
    this.game.scene.start('Game', { character });
    this.showBack(onBack);
  }

  /** Ends a play test (the Studio comes back over the stopped game). */
  endPlay(): void {
    this.hideBack();
    this.stopGame();
  }

  private showBack(onBack: () => void): void {
    this.onBack = onBack;
    if (!this.back) {
      const back = h('button', { class: 'cs-back', type: 'button', title: 'Back to Copper Studio' }, '◀ STUDIO');
      back.addEventListener('click', () => this.onBack?.());
      // Don't let the button keep the keyboard: the game's keys go to the game.
      back.addEventListener('pointerup', () => back.blur());
      document.body.append(back);
      this.back = back;
    }
    this.back.hidden = false;
    this.placeBack();
    window.addEventListener('resize', this.placeBack);
    this.game.scale.on(Phaser.Scale.Events.RESIZE, this.placeBack);
    this.game.registry.events.on(Phaser.Data.Events.SET_DATA, this.onRegistry);
    this.game.registry.events.on(Phaser.Data.Events.CHANGE_DATA, this.onRegistry);
  }

  private hideBack(): void {
    if (this.back) this.back.hidden = true;
    window.removeEventListener('resize', this.placeBack);
    this.game.scale.off(Phaser.Scale.Events.RESIZE, this.placeBack);
    this.game.registry.events.off(Phaser.Data.Events.SET_DATA, this.onRegistry);
    this.game.registry.events.off(Phaser.Data.Events.CHANGE_DATA, this.onRegistry);
  }

  private onRegistry = (_parent: unknown, key: string) => {
    if (key === HUD_LAYOUT) this.placeBack();
  };

  /** Top centre, beside (never over) the HUD's windows. */
  private placeBack = () => {
    const back = this.back;
    const canvas = this.game.canvas;
    if (!back || back.hidden || !canvas) return;
    const c = canvas.getBoundingClientRect();
    const hud = this.game.registry.get(HUD_LAYOUT) as HudLayout | null | undefined;
    const k = hud && hud.width > 0 ? c.width / hud.width : 1;
    const boxes = hud ? hud.boxes.map((b) => ({ x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k })) : [];
    const spot = topCentreSpot(c.width, c.height, back.offsetWidth, back.offsetHeight, boxes);
    back.style.left = `${c.left + spot.x}px`;
    back.style.top = `${c.top + spot.y}px`;
  };
}
