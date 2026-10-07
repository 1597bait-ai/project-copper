import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { CHARACTERS } from '../config/characters';
import { saleValue } from '../systems/Bag';
import { loadSave, updateSave } from '../systems/save';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, Button, COLORS, drawBox, fitColumn, fitWidth, isPortrait, money, textStyle } from '../ui/theme';
import { GameScene, type ShiftSummary } from './GameScene';
import { addSchoolBackdrop } from './MenuScene';

// Summaries already written to the save (the scene restarts on resize; don't count a shift twice).
const recorded = new WeakSet<ShiftSummary>();

/** End-of-shift report: what you sold, what you lost, and whether you still have a job. */
export class ShiftEndScene extends Phaser.Scene {
  private summary!: ShiftSummary;
  private best = 0;
  private newBest = false;

  constructor() {
    super('ShiftEnd');
  }

  init(summary: ShiftSummary): void {
    this.summary = summary;
    if (recorded.has(summary)) return;
    recorded.add(summary);
    const prevBest = loadSave().bestShift;
    const save = updateSave((d) => {
      d.totalEarned = Math.round((d.totalEarned + summary.earned) * 100) / 100;
      d.shiftsWorked += 1;
      if (!summary.fired) d.bestShift = Math.max(d.bestShift, summary.earned);
    });
    this.best = save.bestShift;
    this.newBest = !summary.fired && summary.earned > prevBest && summary.earned > 0;
  }

  create(): void {
    const s = this.summary;
    const portrait = isPortrait(this.scale);
    if (!portrait) this.cameras.main.setZoom(1).setScroll(0, 0);
    const columnH = 1560;
    const { width: W, height: H } = portrait ? fitColumn(this, 1080, columnH) : { width: this.scale.width, height: this.scale.height };
    const cx = W / 2;
    const top = portrait ? Math.max(0, (H - columnH) / 2) : 0;
    addSchoolBackdrop(this, W, H);

    const headline = s.fired ? "YOU'RE FIRED!" : 'SHIFT OVER';
    this.add
      .text(cx, top + 56, headline, textStyle(portrait ? 112 : 128, s.fired ? COLORS.bad : COLORS.good, { fontStyle: '700', strokeThickness: 14, shadow: { offsetX: 8, offsetY: 8, color: COLORS.ink, blur: 0, stroke: true, fill: true } }))
      .setOrigin(0.5, 0);
    const sub = s.fired
      ? 'Mr. Gravy caught you three times. Clean out your locker.'
      : `${CHARACTERS[s.character]?.name ?? 'You'} clocked out at 3:00 PM.`;
    this.add.text(cx, top + (portrait ? 196 : 214), sub, textStyle(portrait ? 40 : 34, COLORS.text, { align: 'center', wordWrap: { width: 960 } })).setOrigin(0.5, 0);

    // The report, in a window.
    const lines: [string, string, string?][] = [
      ['Earned this shift', money(s.earned), COLORS.boxCopper],
      ['Warnings', `${s.warnings} / ${BALANCE.warningsUntilFired}`, s.warnings ? COLORS.boxBad : COLORS.boxGood],
    ];
    if (s.hushMoney > 0) lines.push(['Hush money (sleepy coworker)', money(s.hushMoney), COLORS.boxGood]);
    const lostValue = saleValue(s.lost);
    if (lostValue > 0) lines.push(['Scrap lost (confiscated / unsold)', money(lostValue), COLORS.boxBad]);
    lines.push(['Best shift', money(this.best) + (this.newBest ? '  NEW!' : ''), this.newBest ? COLORS.boxCopper : COLORS.boxText]);

    const winW = portrait ? 980 : 1100;
    const winX = portrait ? cx - winW / 2 : cx - 380;
    const winY = portrait ? top + 560 : 300;
    const left = winX + 50;
    const right = winX + winW - 50;
    // Portrait phones show this column small: bigger text.
    const rowH = portrait ? 84 : 66;
    const win = this.add.graphics();
    let y = winY + 58;
    for (const [label, value, color] of lines) {
      const v = this.add.text(right, y, value, textStyle(portrait ? 46 : 42, color ?? COLORS.boxText, { fontStyle: '700' })).setOrigin(1, 0.5);
      fitWidth(this.add.text(left, y, label, textStyle(portrait ? 38 : 34, COLORS.boxText)).setOrigin(0, 0.5), right - left - v.width - 30);
      y += rowH;
    }
    const sold = GameScene.soldLines(s.sold);
    const soldText = this.add
      .text(left, y - 6, sold.length ? 'Sold:  ' + sold.join('   ·   ') : 'Sold: nothing. Mr. Gravy is proud of you.', textStyle(portrait ? 32 : 26, COLORS.boxMuted, { wordWrap: { width: right - left } }))
      .setOrigin(0, 0);
    const winH = soldText.y + soldText.height + 40 - winY;
    drawBox(win, winX, winY, winW, winH, { unit: 6 });
    win.setDepth(-1);

    // Mr. Gravy (fired) or the van (made it), upright: the van is drawn from the side.
    const art = s.fired ? 'mr_gravy_big' : 'van_big';
    if (portrait) {
      const fw = s.fired ? 280 : 400;
      drawBox(this.add.graphics(), cx - fw / 2, top + 296, fw, 236, { unit: 6, fill: 0xdfe9f5 });
      this.add.image(cx, top + 414, art).setScale(s.fired ? 1 : 0.66);
    } else {
      const ax = winX - 290;
      const ay = winY + winH / 2;
      const frame = this.add.graphics();
      drawBox(frame, ax - 220, ay - 170, 440, 340, { unit: 6, fill: 0xdfe9f5 });
      this.add.image(ax, ay, art).setScale(s.fired ? 1.4 : 0.78);
    }

    const again = s.fired ? 'TRY AGAIN' : 'NEXT SHIFT';
    const by = portrait ? winY + winH + 120 : Math.min(H - 100, Math.max(winY + winH, 640) + 130);
    const replay = () => this.scene.start('Game', { character: s.character, mapText: s.mapText });
    const grey = { ...BUTTON_SECONDARY, width: 420, height: 104, fontSize: 44 };
    if (s.mapText && !portrait) {
      // Played a map from the editor: offer the way straight back to it.
      new Button(this, cx - 460, by, again, replay, { ...BUTTON_PRIMARY, width: 400, height: 104, fontSize: 44 }).setSelected(true);
      new Button(this, cx, by, 'EDIT MAP', () => this.scene.start('Editor', { mapText: s.mapText }), { ...grey, width: 400 });
      new Button(this, cx + 460, by, 'MENU', () => this.scene.start('Menu'), { ...grey, width: 400 });
    } else {
      new Button(this, cx - 240, by, again, replay, { ...BUTTON_PRIMARY, width: 420, height: 104, fontSize: 44 }).setSelected(true);
      new Button(this, cx + 240, by, 'MENU', () => this.scene.start('Menu'), grey);
      if (s.mapText) new Button(this, cx, by + 130, 'EDIT MAP', () => this.scene.start('Editor', { mapText: s.mapText }), { ...grey, width: 900 });
    }

    this.input.keyboard!.once('keydown-ENTER', replay);
    this.input.keyboard!.once('keydown-ESC', () => this.scene.start('Menu'));
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this));
    this.cameras.main.fadeIn(400, 20, 22, 28);
  }

  private onResize() {
    this.scene.restart(this.summary);
  }
}
