import { MATERIALS, MATERIAL_ORDER, type MaterialId } from '../config/materials';

/** Scrap amounts are tracked to the hundredth. */
export const roundScrap = (n: number) => Math.round(n * 100) / 100;
export const roundMoney = (n: number) => Math.round(n * 100) / 100;

export type ScrapContents = Partial<Record<MaterialId, number>>;

/** What Dalton is carrying. Capacity and amounts are in scrap units (board: "bag: 2, holding 0.25, left 1.75"). */
export class Bag {
  private contents: ScrapContents = {};

  constructor(public capacity: number) {}

  get total(): number {
    return roundScrap(MATERIAL_ORDER.reduce((sum, m) => sum + (this.contents[m] ?? 0), 0));
  }

  get free(): number {
    return Math.max(0, roundScrap(this.capacity - this.total));
  }

  get isFull(): boolean {
    return this.free <= 0;
  }

  get isEmpty(): boolean {
    return this.total <= 0;
  }

  /** Adds as much as fits. Returns the amount actually added. */
  add(material: MaterialId, amount: number): number {
    const added = roundScrap(Math.min(Math.max(0, amount), this.free));
    if (added > 0) this.contents[material] = roundScrap((this.contents[material] ?? 0) + added);
    return added;
  }

  /** Empties the bag and returns what was in it. */
  takeAll(): ScrapContents {
    const taken = this.contents;
    this.contents = {};
    return taken;
  }

  peek(): Readonly<ScrapContents> {
    return this.contents;
  }
}

export function saleValue(contents: ScrapContents): number {
  return roundMoney(
    MATERIAL_ORDER.reduce((sum, m) => sum + (contents[m] ?? 0) * MATERIALS[m].pricePerUnit, 0),
  );
}

export function mergeContents(into: ScrapContents, from: ScrapContents): void {
  for (const m of MATERIAL_ORDER) {
    if (from[m]) into[m] = roundScrap((into[m] ?? 0) + from[m]!);
  }
}
