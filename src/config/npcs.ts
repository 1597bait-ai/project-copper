// Non-player characters. Stat blocks from the design board (Speed / Awareness), and what they say.

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
  // Design board: very, very sleepy, always asleep at work, suffers from intense very real
  // migraines. Naps under desks; scrap the wrong desk and he pays you to keep quiet.
  sleepy_coworker: { id: 'sleepy_coworker', name: 'Sleepy Coworker', speed: 0.5, awareness: 0, sprite: 'sleepy_coworker' },
};

// Lines are picked at random from each list. Keep them short: speech bubbles wrap at about
// 20 characters a line and should stay readable on a phone.

export const STUDENT_LINES = {
  /** Seeing you with scrap (or scrapping). */
  redHanded: ["MR. GRAVY!! He's stealing copper!", 'MR. GRAVY!! Thief!', "He's ripping out the pipes!", 'MR. GRAVY! Look what he took!'],
  /** On high alert, after staring at you empty-handed for a while. */
  suspect: ["MR. GRAVY! It's the copper guy!", "Hey! That's him!", "MR. GRAVY! He's back!"],
  /** Following you and yelling again. */
  again: ["He's over here!", 'MR. GRAVY! This way!', "He's getting away!", 'Over HERE!'],
  /** Mr. Gravy just caught you. */
  busted: ['Busted!', 'Ha! Told you!', 'Ooooh, busted!'],
  /** Talking among themselves on high alert. */
  chatter: [
    "Did you hear? Someone's stealing copper!",
    'Keep your eyes open!',
    "Mr. Gravy's on the warpath!",
    'I heard he took a whole fountain!',
    'Watch for a guy with a big sack!',
    'Stay sharp!',
  ],
};

export const GRAVY_LINES = {
  /** Catching you, by warning number (the last one repeats). */
  caught: ["HEY! That's school property!", 'What do you think you\'re doing?!', 'My office. NOW. ...Actually, get back to work.'],
  /** Hearing a student yell (only shown when he wasn't already on his way). */
  heard: ['Hm?! On my way!', 'WHAT?!', 'Who said copper?!'],
};

/** `{money}` is replaced by the amount he pays. */
export const COWORKER_LINES = {
  wake: "Whoa! I wasn't sleeping! I was... inspecting the desk.",
  bribe: "...Look. You didn't see me, I didn't see you. Here's {money}. Don't tell the boss.",
};
