import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { CHARACTERS } from '../config/characters';
import { saleValue } from '../systems/Bag';
import { loadSave, updateSave } from '../systems/save';
import { Button, COLORS, fitColumn, isPortrait, money, textStyle } from '../ui/theme';
import { GameScene, type ShiftSummary } from './GameScene';

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
    const { width: W, height: H } = portrait ? fitColumn(this, 1080, 1700) : { width: this.scale.width, height: this.scale.height };
    const cx = W / 2;
    const top = portrait ? Math.max(0, (H - 1700) / 2) : 0;
    const g = this.add.graphics();
    g.fillGradientStyle(0x1d2230, 0x1d2230, 0x0f1117, 0x0f1117, 1).fillRect(0, 0, W, H);

    const headline = s.fired ? "YOU'RE FIRED!" : 'SHIFT OVER';
    this.add
      .text(cx, top + 70, headline, textStyle(portrait ? 96 : 120, s.fired ? COLORS.bad : COLORS.good, { strokeThickness: 16 }))
      .setOrigin(0.5, 0)
      .setShadow(0, 8, '#000', 0, true, true);
    const sub = s.fired
      ? 'Mr. Gravy caught you three times. Clean out your locker.'
      : `${CHARACTERS[s.character]?.name ?? 'You'} clocked out at 3:00 PM.`;
    this.add.text(cx, top + (portrait ? 200 : 220), sub, textStyle(32, COLORS.muted, { align: 'center', wordWrap: { width: 960 } })).setOrigin(0.5, 0);

    const art = s.fired ? 'mr_gravy_big' : 'van_big';
    if (portrait) {
      this.add.image(cx, top + 430, art).setRotation(s.fired ? -Math.PI / 2 : Math.PI / 2).setScale(s.fired ? 1 : 0.5);
    } else {
      this.add.image(cx - 520, 520, art).setRotation(s.fired ? -Math.PI / 2 : 0).setScale(s.fired ? 1.1 : 0.7);
    }

    const lines: [string, string, string?][] = [
      ['Earned this shift', money(s.earned), COLORS.copper],
      ['Warnings', `${s.warnings} / ${BALANCE.warningsUntilFired}`, s.warnings ? COLORS.bad : COLORS.good],
    ];
    const lostValue = saleValue(s.lost);
    if (lostValue > 0) lines.push(['Scrap lost (confiscated / unsold)', money(lostValue), COLORS.bad]);
    lines.push(['Best shift', money(this.best) + (this.newBest ? '  NEW!' : ''), this.newBest ? COLORS.warn : COLORS.text]);

    const left = portrait ? cx - 460 : cx - 280;
    const right = portrait ? cx + 460 : cx + 560;
    let y = portrait ? top + 640 : 330;
    for (const [label, value, color] of lines) {
      this.add.text(left, y, label, textStyle(portrait ? 30 : 34)).setOrigin(0, 0.5);
      this.add.text(right, y, value, textStyle(40, color ?? COLORS.text)).setOrigin(1, 0.5);
      y += portrait ? 80 : 70;
    }
    const sold = GameScene.soldLines(s.sold);
    this.add
      .text(left, y + 10, sold.length ? 'Sold:  ' + sold.join('   ·   ') : 'Sold: nothing. Mr. Gravy is proud of you.', textStyle(24, COLORS.muted, { wordWrap: { width: right - left } }))
      .setOrigin(0, 0);

    const again = s.fired ? 'TRY AGAIN' : 'NEXT SHIFT';
    const by = portrait ? y + 240 : H - 150;
    new Button(this, cx - 240, by, again, () => this.scene.start('Game', { character: s.character }), { width: 420, height: 104, fontSize: 44 });
    new Button(this, cx + 240, by, 'MENU', () => this.scene.start('Menu'), { width: 420, height: 104, fontSize: 44, fill: 0x3d4558 });

    this.input.keyboard!.once('keydown-ENTER', () => this.scene.start('Game', { character: s.character }));
    this.input.keyboard!.once('keydown-ESC', () => this.scene.start('Menu'));
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this));
    this.cameras.main.fadeIn(400, 20, 22, 28);
  }

  private onResize() {
    this.scene.restart(this.summary);
  }
}
