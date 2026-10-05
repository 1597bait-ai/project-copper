import { describe, expect, it } from 'vitest';
import { Bag, mergeContents, saleValue } from './Bag';

describe('Bag', () => {
  it('matches the design board example: bag 2, holding 0.25, left 1.75', () => {
    const bag = new Bag(2);
    bag.add('copper', 0.25);
    expect(bag.total).toBe(0.25);
    expect(bag.free).toBe(1.75);
  });

  it('only takes what fits and reports the amount added', () => {
    const bag = new Bag(2);
    expect(bag.add('copper', 1.5)).toBe(1.5);
    expect(bag.add('brass', 0.75)).toBe(0.5);
    expect(bag.isFull).toBe(true);
    expect(bag.add('steel', 1)).toBe(0);
  });

  it('empties into a sale', () => {
    const bag = new Bag(3);
    bag.add('copper', 1);
    bag.add('steel', 1);
    const contents = bag.takeAll();
    expect(bag.isEmpty).toBe(true);
    expect(saleValue(contents)).toBe(12); // copper $10 + steel $2
  });

  it('avoids floating point drift', () => {
    const bag = new Bag(2);
    for (let i = 0; i < 8; i++) bag.add('brass', 0.25);
    expect(bag.total).toBe(2);
    expect(bag.isFull).toBe(true);
  });

  it('merges contents', () => {
    const into = { copper: 1 };
    mergeContents(into, { copper: 0.5, brass: 0.25 });
    expect(into).toEqual({ copper: 1.5, brass: 0.25 });
  });
});
