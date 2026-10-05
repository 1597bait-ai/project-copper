// Scrap metals, from the design board:
//   Copper = highest value, Brass = 2nd, Aluminum = 3rd, Steel = lowest value
// Prices are dollars per unit of scrap (the same unit the bag capacity uses).

export type MaterialId = 'copper' | 'brass' | 'aluminum' | 'steel';

export interface MaterialDef {
  id: MaterialId;
  name: string;
  pricePerUnit: number;
  /** UI colour (0xRRGGBB). */
  color: number;
}

export const MATERIALS: Record<MaterialId, MaterialDef> = {
  copper: { id: 'copper', name: 'Copper', pricePerUnit: 10, color: 0xe0823d },
  brass: { id: 'brass', name: 'Brass', pricePerUnit: 6, color: 0xd9b440 },
  aluminum: { id: 'aluminum', name: 'Aluminum', pricePerUnit: 4, color: 0xb9c4cf },
  steel: { id: 'steel', name: 'Steel', pricePerUnit: 2, color: 0x7f8894 },
};

export const MATERIAL_ORDER: MaterialId[] = ['copper', 'brass', 'aluminum', 'steel'];
