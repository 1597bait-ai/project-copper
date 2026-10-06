// Non-player characters. Stat blocks from the design board (Speed / Awareness).

export interface NpcDef {
  id: string;
  name: string;
  speed: number;
  awareness: number;
  sprite: string;
  /** Alternative looks, handed out by index so a crowd doesn't look cloned. */
  variants?: string[];
}

export const NPCS: Record<string, NpcDef> = {
  mr_gravy: { id: 'mr_gravy', name: 'Mr. Gravy', speed: 2, awareness: 2, sprite: 'mr_gravy' },
  student: { id: 'student', name: 'Student', speed: 1, awareness: 1, sprite: 'student', variants: ['student', 'student_b', 'student_c'] },
};

// Planned (design board): the Sleepy Coworker — very, very sleepy, always asleep at work,
// suffers from intense very real migraines. If found, the player recovers 1 warning.
