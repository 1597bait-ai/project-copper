import type Phaser from 'phaser';
import type { Point } from '../systems/pathfinding';

// How vision cones look on the floor. A flat tint shows where someone is looking, and a two-tone
// rim (a dark line with a light line along its middle) keeps the edge readable on every floor: the
// dark line shows on the cream halls and pink restrooms, the light one on the asphalt and the grey
// boiler room. Mr. Gravy's cones are amber, the students' blue; both turn orange while they're
// unsure about Dalton and red once they're after him.

export interface ConeLook {
  /** The tint on the floor, and its opacity. */
  fill: number;
  fillAlpha: number;
  /** The rim: dark outside line and light middle line, and their opacity. */
  dark: number;
  light: number;
  rimAlpha: number;
}

export const CONE_LOOKS = {
  /** Mr. Gravy on his rounds. */
  boss: { fill: 0xffb52e, fillAlpha: 0.2, dark: 0xb86210, light: 0xffd36a, rimAlpha: 0.8 },
  /** Mr. Gravy unsure ('?'), searching, or sprinting to a student's yell. */
  bossSuspicious: { fill: 0xff8a2a, fillAlpha: 0.24, dark: 0xa8480e, light: 0xffb46a, rimAlpha: 0.85 },
  bossChase: { fill: 0xff4d3d, fillAlpha: 0.28, dark: 0x96201a, light: 0xff9080, rimAlpha: 0.9 },
  /** A student hanging out. */
  student: { fill: 0x6cb8ff, fillAlpha: 0.13, dark: 0x2c66b0, light: 0xb4dcff, rimAlpha: 0.55 },
  /** A student on high alert: a deeper blue (the cone is bigger, too). */
  studentAlert: { fill: 0x5a8cff, fillAlpha: 0.18, dark: 0x22409a, light: 0xa8c4ff, rimAlpha: 0.75 },
  /** A student staring with a '?'. */
  studentNotice: { fill: 0xffa53d, fillAlpha: 0.2, dark: 0xa85a10, light: 0xffc87a, rimAlpha: 0.8 },
  /** A student yelling or following. */
  studentAfter: { fill: 0xff6a5a, fillAlpha: 0.22, dark: 0x9a2a22, light: 0xff9a8a, rimAlpha: 0.85 },
} satisfies Record<string, ConeLook>;

/** The same look, faded (after a warning, or while a student leaves Dalton alone). */
export function fadedCone(look: ConeLook, k: number): ConeLook {
  return { ...look, fillAlpha: look.fillAlpha * k, rimAlpha: look.rimAlpha * k };
}

/** Draws a cone outline (from vision.conePolygon) with `look`. */
export function drawCone(g: Phaser.GameObjects.Graphics, poly: Point[], look: ConeLook): void {
  // Graphics only reads x/y from the points.
  const pts = poly as Phaser.Math.Vector2[];
  g.fillStyle(look.fill, look.fillAlpha).fillPoints(pts, true);
  g.lineStyle(5, look.dark, look.rimAlpha).strokePoints(pts, true);
  g.lineStyle(2, look.light, look.rimAlpha).strokePoints(pts, true);
}
