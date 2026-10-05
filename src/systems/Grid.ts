/** A simple boolean tile grid used for pathfinding (solid) and line of sight (opaque). */
export class Grid {
  readonly cells: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly tileSize: number,
  ) {
    this.cells = new Uint8Array(width * height);
  }

  static fromRows(rows: string[], tileSize: number, blockedChar = '#'): Grid {
    const grid = new Grid(rows[0].length, rows.length, tileSize);
    rows.forEach((row, y) => [...row].forEach((ch, x) => grid.set(x, y, ch === blockedChar)));
    return grid;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }

  /** Out-of-bounds counts as blocked. */
  blocked(tx: number, ty: number): boolean {
    return !this.inBounds(tx, ty) || this.cells[ty * this.width + tx] === 1;
  }

  set(tx: number, ty: number, blocked: boolean): void {
    if (this.inBounds(tx, ty)) this.cells[ty * this.width + tx] = blocked ? 1 : 0;
  }

  blockedAtWorld(x: number, y: number): boolean {
    return this.blocked(Math.floor(x / this.tileSize), Math.floor(y / this.tileSize));
  }

  toTile(x: number, y: number): { tx: number; ty: number } {
    return { tx: Math.floor(x / this.tileSize), ty: Math.floor(y / this.tileSize) };
  }

  center(tx: number, ty: number): { x: number; y: number } {
    return { x: (tx + 0.5) * this.tileSize, y: (ty + 0.5) * this.tileSize };
  }
}
