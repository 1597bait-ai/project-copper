// Non-player characters. Stat blocks from the design board (Speed / Awareness).

export interface NpcDef {
  id: string;
  name: string;
  speed: number;
  awareness: number;
  sprite: string;
}

export const NPCS: Record<string, NpcDef> = {
  mr_gravy: { id: 'mr_gravy', name: 'Mr. Gravy', speed: 2, awareness: 2, sprite: 'mr_gravy' },
  // Not in the first playable yet:
  student: { id: 'student', name: 'Student', speed: 1, awareness: 1, sprite: 'student' },
};

// Planned (design board): the Sleepy Coworker — very, very sleepy, always asleep at work,
// suffers from intense very real migraines. If found, the player recovers 1 warning.
