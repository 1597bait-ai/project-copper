// Scrap metals, from the design board:
//   Copper = highest value, Brass = 2nd, Aluminum = 3rd, Steel = lowest value
// plus bare bright copper (clean, stripped copper wire — the top grade at a real scrap yard),
// found in the abandoned copper piles deep in the school, so going deeper pays more per trip.
// Prices are dollars per unit of scrap (the same unit the bag capacity uses).

export type MaterialId = 'bare_bright' | 'copper' | 'brass' | 'aluminum' | 'steel';

export interface MaterialDef {
  id: MaterialId;
  name: string;
  pricePerUnit: number;
  /** UI colour (0xRRGGBB). */
  color: number;
}

export const MATERIALS: Record<MaterialId, MaterialDef> = {
  bare_bright: { id: 'bare_bright', name: 'Bare Bright Copper', pricePerUnit: 20, color: 0xffb070 },
  copper: { id: 'copper', name: 'Copper', pricePerUnit: 10, color: 0xe0823d },
  brass: { id: 'brass', name: 'Brass', pricePerUnit: 6, color: 0xd9b440 },
  aluminum: { id: 'aluminum', name: 'Aluminum', pricePerUnit: 4, color: 0xb9c4cf },
  steel: { id: 'steel', name: 'Steel', pricePerUnit: 2, color: 0x7f8894 },
};

export const MATERIAL_ORDER: MaterialId[] = ['bare_bright', 'copper', 'brass', 'aluminum', 'steel'];
