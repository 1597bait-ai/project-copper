// Tiny persistent save (localStorage). Storage can be unavailable (private mode, embeds),
// so every access is guarded and the game works fine without it.

export interface SaveData {
  bestShift: number;
  totalEarned: number;
  shiftsWorked: number;
  character: string;
  muted: boolean;
}

const KEY = 'project-copper/save/v1';
const DEFAULTS: SaveData = { bestShift: 0, totalEarned: 0, shiftsWorked: 0, character: 'dalton', muted: false };

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return { ...DEFAULTS };
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function updateSave(patch: (data: SaveData) => void): SaveData {
  const data = loadSave();
  patch(data);
  writeSave(data);
  return data;
}
