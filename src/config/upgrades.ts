// Character improvements from the design board. Not wired into the first playable yet —
// the shop between shifts will read this list. Costs and bonus sizes are placeholders.

export type UpgradeTrack = 'boots' | 'tools' | 'bag' | 'keys';

export interface UpgradeTier {
  name: string;
  cost: number;
  /** Added to the matching stat (speed / repair / carry), or seconds off door unlocks for keys. */
  bonus: number;
}

export interface UpgradeTrackDef {
  track: UpgradeTrack;
  label: string;
  tiers: UpgradeTier[];
}

export const UPGRADES: UpgradeTrackDef[] = [
  {
    track: 'boots',
    label: 'Improve speed / sprint',
    tiers: [
      { name: 'Cowboy Boots', cost: 50, bonus: 0.5 },
      { name: 'Super Cool Cowboy Boots', cost: 120, bonus: 1 },
      { name: 'Just-Tens Cowboy Boots', cost: 250, bonus: 1.5 },
    ],
  },
  {
    track: 'tools',
    label: 'Improve scrapping rate',
    tiers: [
      { name: 'Ten-in-One Screwdriver', cost: 50, bonus: 0.5 },
      { name: 'Pocket Pliers with Holster', cost: 120, bonus: 1 },
      { name: 'Milt-Wakee Drill/Driver', cost: 250, bonus: 1.5 },
    ],
  },
  {
    track: 'bag',
    label: 'Improve copper capacity',
    tiers: [
      { name: 'Cardboard Box', cost: 50, bonus: 0.5 },
      { name: 'Backpack', cost: 120, bonus: 1 },
      { name: 'Rolling Cart', cost: 250, bonus: 2 },
    ],
  },
  {
    track: 'keys',
    label: 'Improve door unlock speed',
    tiers: [
      { name: 'Efficient Key Ring', cost: 60, bonus: 1 },
      { name: 'Master Key', cost: 150, bonus: 2 },
    ],
  },
];
