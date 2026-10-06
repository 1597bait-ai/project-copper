// Placeholder "flash-style" vector art. Every sprite is an SVG string that gets rasterized
// into a Phaser texture at boot (see rasterize.ts), so swapping in real art later is just
// replacing an entry here (or loading a PNG with the same key).
//
// Conventions: characters are top-down and face RIGHT (angle 0). Wall-mounted fixtures are
// drawn with the wall along the TOP edge, facing down; the game rotates them into place.

export interface SpriteDef {
  key: string;
  width: number;
  height: number;
  svg: string;
}

const INK = '#1b1d24';

const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

interface WorkerLook {
  shirt: string;
  skin: string;
  /** Drawn on top of the head (hat / hair). */
  head?: string;
  /** Drawn behind the torso (backpacks etc). */
  back?: string;
  /** Drawn over the torso (ties, logos). */
  front?: string;
}

function worker(look: WorkerLook, size = 64): string {
  const s = size / 64;
  return svg(
    size,
    size,
    `<g transform="scale(${s})">
      ${look.back ?? ''}
      <ellipse cx="31" cy="12" rx="10" ry="6.5" fill="${look.shirt}" stroke="${INK}" stroke-width="2.5"/>
      <ellipse cx="31" cy="52" rx="10" ry="6.5" fill="${look.shirt}" stroke="${INK}" stroke-width="2.5"/>
      <circle cx="42" cy="12" r="5" fill="${look.skin}" stroke="${INK}" stroke-width="2.5"/>
      <circle cx="42" cy="52" r="5" fill="${look.skin}" stroke="${INK}" stroke-width="2.5"/>
      <rect x="16" y="13" width="26" height="38" rx="13" fill="${look.shirt}" stroke="${INK}" stroke-width="3"/>
      ${look.front ?? ''}
      <circle cx="31" cy="32" r="11.5" fill="${look.skin}" stroke="${INK}" stroke-width="3"/>
      ${look.head ?? ''}
    </g>`,
  );
}

const SKIN = '#f2c38f';

const truckerCap = (crown: string, brim: string) => `
  <path d="M36 21.5 Q50 32 36 42.5 Z" fill="${brim}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="30" cy="32" r="11" fill="${crown}" stroke="${INK}" stroke-width="2.5"/>
  <path d="M22 26 Q30 32 22 38" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2"/>
  <circle cx="29" cy="32" r="2" fill="${brim}"/>`;

const greyHorseshoe = `<path d="M33 21 A11.5 11.5 0 1 0 33 43" fill="none" stroke="#d5d8db" stroke-width="5.5" stroke-linecap="round"/>`;

const beanie = (color: string) => `
  <circle cx="30" cy="32" r="11.5" fill="${color}" stroke="${INK}" stroke-width="2.5"/>
  <path d="M24 23 V41 M30 21 V43 M36 23 V41" stroke="#000" stroke-opacity="0.25" stroke-width="1.6"/>
  <circle cx="29" cy="32" r="4" fill="#f5f5f5" stroke="${INK}" stroke-width="1.5"/>`;

const backpack = (color: string) => `
  <rect x="5" y="18" width="16" height="28" rx="6" fill="${color}" stroke="${INK}" stroke-width="2.5"/>
  <rect x="7" y="24" width="8" height="16" rx="3" fill="#000" fill-opacity="0.18"/>`;

const hood = (color: string) => `
  <path d="M33 20.5 A12 12 0 1 0 33 43.5 L29 39 A8 8 0 1 1 29 25 Z" fill="${color}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;

function gravy(size = 76): string {
  const s = size / 76;
  return svg(
    size,
    size,
    `<g transform="scale(${s})">
      <ellipse cx="37" cy="13" rx="12" ry="7.5" fill="#7b5534" stroke="${INK}" stroke-width="2.8"/>
      <ellipse cx="37" cy="63" rx="12" ry="7.5" fill="#7b5534" stroke="${INK}" stroke-width="2.8"/>
      <circle cx="50" cy="13" r="6" fill="${SKIN}" stroke="${INK}" stroke-width="2.8"/>
      <circle cx="50" cy="63" r="6" fill="${SKIN}" stroke="${INK}" stroke-width="2.8"/>
      <circle cx="57" cy="64" r="7" fill="#ffffff" stroke="${INK}" stroke-width="2.5"/>
      <circle cx="57" cy="64" r="4" fill="#6b3f1d"/>
      <rect x="17" y="13" width="34" height="50" rx="16" fill="#7b5534" stroke="${INK}" stroke-width="3.2"/>
      <path d="M44 30 L51 38 L44 46 Z" fill="#ffffff" stroke="${INK}" stroke-width="2"/>
      <path d="M46 34 L51 38 L46 42 Z" fill="#c62828"/>
      <circle cx="35" cy="38" r="14" fill="${SKIN}" stroke="${INK}" stroke-width="3.2"/>
      <path d="M26 30 Q36 34 44 30 M25 36 Q36 40 45 35 M26 42 Q36 45 44 41" fill="none" stroke="#4a3426" stroke-width="2" stroke-linecap="round"/>
      <ellipse cx="22.5" cy="38" rx="3" ry="6" fill="#6b4b36" opacity="0.8"/>
    </g>`,
  );
}

function van(scale = 1): string {
  const rungs = Array.from({ length: 9 }, (_, i) => 84 + i * 18)
    .map((y) => `<path d="M36 ${y} H92" stroke="#8f979e" stroke-width="4"/>`)
    .join('');
  return svg(
    128 * scale,
    256 * scale,
    `<g transform="scale(${scale})">
      <rect x="2" y="44" width="12" height="18" rx="3" fill="#cfd3d6" stroke="${INK}" stroke-width="3"/>
      <rect x="114" y="44" width="12" height="18" rx="3" fill="#cfd3d6" stroke="${INK}" stroke-width="3"/>
      <rect x="10" y="6" width="108" height="244" rx="24" fill="#f3f4f0" stroke="${INK}" stroke-width="4"/>
      <rect x="18" y="10" width="20" height="8" rx="3" fill="#ffe082" stroke="${INK}" stroke-width="2"/>
      <rect x="90" y="10" width="20" height="8" rx="3" fill="#ffe082" stroke="${INK}" stroke-width="2"/>
      <rect x="20" y="34" width="88" height="32" rx="9" fill="#5d7f99" stroke="${INK}" stroke-width="3"/>
      <path d="M28 40 L48 40 L36 60 Z" fill="#ffffff" opacity="0.35"/>
      <rect x="18" y="72" width="92" height="168" rx="10" fill="#e7e9e5" stroke="#c4c8c3" stroke-width="3"/>
      <path d="M36 80 V232 M92 80 V232" stroke="#6f777f" stroke-width="5" stroke-linecap="round"/>
      ${rungs}
      <ellipse cx="102" cy="226" rx="7" ry="5" fill="#b5652f" opacity="0.65"/>
      <ellipse cx="22" cy="150" rx="4" ry="6" fill="#b5652f" opacity="0.5"/>
      <path d="M64 236 V250" stroke="${INK}" stroke-width="3"/>
    </g>`,
  );
}

const PIPE = '#e0823d';

const FIXTURE_ART: Record<string, string> = {
  drinking_fountain: svg(
    64,
    64,
    `<rect x="12" y="0" width="40" height="8" fill="#7d858d"/>
     <rect x="8" y="4" width="48" height="36" rx="11" fill="#cdd5dc" stroke="${INK}" stroke-width="3"/>
     <ellipse cx="32" cy="23" rx="15" ry="10" fill="#9fb0bf" stroke="#6e7f8e" stroke-width="2"/>
     <circle cx="32" cy="21" r="3.5" fill="${PIPE}" stroke="${INK}" stroke-width="1.5"/>
     <rect x="46" y="9" width="7" height="7" rx="2" fill="${PIPE}" stroke="${INK}" stroke-width="1.5"/>`,
  ),
  wall_heater: svg(
    64,
    64,
    `<rect x="0" y="9" width="8" height="8" fill="${PIPE}" stroke="${INK}" stroke-width="1.5"/>
     <rect x="56" y="9" width="8" height="8" fill="${PIPE}" stroke="${INK}" stroke-width="1.5"/>
     <rect x="5" y="1" width="54" height="24" rx="4" fill="#ddd7c7" stroke="${INK}" stroke-width="3"/>
     ${Array.from({ length: 8 }, (_, i) => `<path d="M${12 + i * 6} 6 V20" stroke="#a59f8f" stroke-width="2.5" stroke-linecap="round"/>`).join('')}`,
  ),
  toilet: svg(
    64,
    64,
    `<rect x="13" y="1" width="38" height="15" rx="4" fill="#fbfbfb" stroke="${INK}" stroke-width="3"/>
     <rect x="38" y="5" width="8" height="4" rx="2" fill="#d9b440"/>
     <ellipse cx="32" cy="36" rx="15" ry="19" fill="#fbfbfb" stroke="${INK}" stroke-width="3"/>
     <ellipse cx="32" cy="38" rx="9" ry="12" fill="#cfe3ef" stroke="#9fb6c4" stroke-width="2"/>`,
  ),
  mop_sink: svg(
    64,
    64,
    `<rect x="5" y="2" width="54" height="50" rx="7" fill="#b3bbc2" stroke="${INK}" stroke-width="3"/>
     <rect x="12" y="12" width="40" height="34" rx="5" fill="#8a949c"/>
     <circle cx="32" cy="29" r="3" fill="#5d666e"/>
     <rect x="27" y="2" width="10" height="12" rx="2" fill="#d9b440" stroke="${INK}" stroke-width="2"/>
     <path d="M14 58 L46 18" stroke="#a87a45" stroke-width="4" stroke-linecap="round"/>
     <circle cx="14" cy="58" r="7" fill="#d8d3c6" stroke="${INK}" stroke-width="2"/>`,
  ),
  desk: svg(
    64,
    64,
    `<rect x="18" y="38" width="28" height="20" rx="6" fill="#3f6fb5" stroke="${INK}" stroke-width="2.5"/>
     <path d="M20 58 H44" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
     <rect x="7" y="6" width="50" height="28" rx="3" fill="#cfa772" stroke="${INK}" stroke-width="3"/>
     <path d="M11 14 H53" stroke="#b58c58" stroke-width="2"/>
     <rect x="16" y="18" width="16" height="11" fill="#f5f2e8" stroke="#9e9a8e" stroke-width="1"/>
     <circle cx="8" cy="7" r="3" fill="#8b939b"/><circle cx="56" cy="7" r="3" fill="#8b939b"/>
     <circle cx="8" cy="33" r="3" fill="#8b939b"/><circle cx="56" cy="33" r="3" fill="#8b939b"/>`,
  ),
  lamp: svg(
    64,
    64,
    `<defs><radialGradient id="g"><stop offset="0" stop-color="#fff3b0" stop-opacity="0.85"/><stop offset="1" stop-color="#fff3b0" stop-opacity="0"/></radialGradient></defs>
     <circle cx="32" cy="32" r="31" fill="url(#g)"/>
     <path d="M32 50 Q44 58 60 60" stroke="${PIPE}" stroke-width="3" fill="none" stroke-linecap="round"/>
     <circle cx="32" cy="32" r="18" fill="#f2e2b0" stroke="${INK}" stroke-width="3"/>
     <circle cx="32" cy="32" r="9" fill="#fffbe6" stroke="#d8c58a" stroke-width="2"/>`,
  ),
  electric_panel: svg(
    64,
    64,
    `<rect x="10" y="2" width="44" height="54" rx="3" fill="#8f99a3" stroke="${INK}" stroke-width="3"/>
     <rect x="16" y="9" width="32" height="40" fill="#5d666e"/>
     <path d="M20 14 H44 M20 22 H44 M20 30 H44 M20 38 H44" stroke="${PIPE}" stroke-width="4"/>
     <path d="M34 42 L28 50 H34 L30 58" stroke="#ffd23d" stroke-width="2.5" fill="none"/>`,
  ),
  abandoned_copper_pile: svg(
    64,
    64,
    `<ellipse cx="32" cy="38" rx="28" ry="20" fill="#000" opacity="0.18"/>
     <path d="M8 44 L52 26" stroke="#b05a22" stroke-width="7" stroke-linecap="round"/>
     <path d="M8 44 L52 26" stroke="#f0a060" stroke-width="2" stroke-linecap="round"/>
     <path d="M12 26 L50 48" stroke="#c96a2c" stroke-width="7" stroke-linecap="round"/>
     <path d="M12 26 L50 48" stroke="#f6b27a" stroke-width="2" stroke-linecap="round"/>
     <ellipse cx="24" cy="36" rx="13" ry="10" fill="none" stroke="${PIPE}" stroke-width="4"/>
     <ellipse cx="24" cy="36" rx="8" ry="6" fill="none" stroke="#c96a2c" stroke-width="3"/>
     <ellipse cx="42" cy="34" rx="10" ry="8" fill="none" stroke="#e99350" stroke-width="4"/>
     <path d="M30 14 Q40 10 46 18" stroke="${PIPE}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  ),
};

const doorLocked = svg(
  128,
  64,
  `<rect x="0" y="22" width="128" height="20" fill="#2d3340"/>
   <rect x="4" y="18" width="59" height="28" rx="2" fill="#6d7d8e" stroke="${INK}" stroke-width="3"/>
   <rect x="65" y="18" width="59" height="28" rx="2" fill="#6d7d8e" stroke="${INK}" stroke-width="3"/>
   <path d="M14 26 H52 M14 38 H52 M76 26 H114 M76 38 H114" stroke="#56626f" stroke-width="2"/>
   <path d="M58 22 A6 6 0 0 1 70 22 V30" fill="none" stroke="#9aa3ab" stroke-width="3"/>
   <rect x="55" y="27" width="18" height="15" rx="3" fill="#f2b632" stroke="${INK}" stroke-width="2.5"/>
   <circle cx="64" cy="34" r="2.2" fill="${INK}"/>`,
);

const doorOpen = svg(
  128,
  64,
  `<rect x="0" y="0" width="6" height="64" fill="#2d3340"/>
   <rect x="122" y="0" width="6" height="64" fill="#2d3340"/>
   <rect x="6" y="30" width="7" height="34" rx="2" fill="#6d7d8e" stroke="${INK}" stroke-width="2.5"/>
   <rect x="115" y="30" width="7" height="34" rx="2" fill="#6d7d8e" stroke="${INK}" stroke-width="2.5"/>
   <path d="M6 31 H122" stroke="#8b939b" stroke-width="3" stroke-dasharray="6 5"/>`,
);

const sack = svg(
  40,
  40,
  `<path d="M14 6 L26 6 L24 12 Q36 18 35 28 Q33 37 20 37 Q7 37 5 28 Q4 18 16 12 Z" fill="#b8925a" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
   <path d="M15 12 Q20 15 25 12" stroke="${INK}" stroke-width="2" fill="none"/>
   <path d="M17 4 L12 0 M22 4 L26 -1" stroke="${PIPE}" stroke-width="3" stroke-linecap="round"/>
   <path d="M12 24 Q20 28 28 24" stroke="#8d6c3e" stroke-width="2" fill="none"/>`,
);

const shadow = svg(
  64,
  64,
  `<defs><radialGradient id="s"><stop offset="0" stop-color="#000" stop-opacity="0.45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
   <circle cx="32" cy="32" r="32" fill="url(#s)"/>`,
);

/** Placeholder decorations (the pixel art in src/art/ replaces them). */
const DECOR_ART: Record<string, [number, number, string]> = {
  plant: [64, 64, svg(64, 64, `<rect x="20" y="36" width="24" height="22" rx="3" fill="#b5653a" stroke="${INK}" stroke-width="3"/><circle cx="32" cy="26" r="18" fill="#3f9b4b" stroke="${INK}" stroke-width="3"/>`)],
  trash_can: [64, 64, svg(64, 64, `<rect x="16" y="14" width="32" height="44" rx="4" fill="#5f7d8e" stroke="${INK}" stroke-width="3"/><rect x="12" y="8" width="40" height="8" rx="3" fill="#7894a3" stroke="${INK}" stroke-width="3"/>`)],
  tree: [64, 64, svg(64, 64, `<rect x="27" y="38" width="10" height="24" fill="#7a4e2d" stroke="${INK}" stroke-width="3"/><circle cx="32" cy="26" r="24" fill="#2f7d3a" stroke="${INK}" stroke-width="3"/>`)],
  car: [128, 128, svg(128, 128, `<rect x="14" y="10" width="100" height="108" rx="22" fill="#c0392b" stroke="${INK}" stroke-width="4"/><rect x="26" y="30" width="76" height="26" rx="6" fill="#9fd3f0" stroke="${INK}" stroke-width="3"/><rect x="26" y="80" width="76" height="20" rx="6" fill="#9fd3f0" stroke="${INK}" stroke-width="3"/>`)],
};

const looks: Record<string, WorkerLook> = {
  dalton: { shirt: '#4caf50', skin: SKIN, head: truckerCap('#263238', '#1b2327') },
  dalton_disguise: {
    shirt: '#7e57c2',
    skin: SKIN,
    back: backpack('#f9a825'),
    head: hood('#673ab7'),
  },
  tomothy: { shirt: '#42a5f5', skin: '#efc19a', head: greyHorseshoe },
  dunkin: { shirt: '#ef5350', skin: '#d9a273', head: beanie('#37474f') },
  student: { shirt: '#26a69a', skin: '#e0ac69', back: backpack('#ef6c00'), head: hood('#00897b') },
  student_b: { shirt: '#ec407a', skin: '#f6cfa6', back: backpack('#3949ab'), head: hood('#c2185b') },
  student_c: { shirt: '#fbc02d', skin: '#8d5a3b', back: backpack('#2e7d32'), head: hood('#f57f17') },
  sleepy_coworker: { shirt: '#8d6e63', skin: SKIN, head: beanie('#5d4037') },
};

export function allSprites(): SpriteDef[] {
  const sprites: SpriteDef[] = [];
  for (const [key, look] of Object.entries(looks)) {
    sprites.push({ key, width: 64, height: 64, svg: worker(look) });
    sprites.push({ key: `${key}_big`, width: 192, height: 192, svg: worker(look, 192) });
  }
  sprites.push({ key: 'mr_gravy', width: 76, height: 76, svg: gravy() });
  sprites.push({ key: 'mr_gravy_big', width: 228, height: 228, svg: gravy(228) });
  sprites.push({ key: 'van', width: 128, height: 256, svg: van() });
  sprites.push({ key: 'van_big', width: 256, height: 512, svg: van(2) });
  for (const [key, art] of Object.entries(FIXTURE_ART)) sprites.push({ key, width: 64, height: 64, svg: art });
  for (const [key, [width, height, art]] of Object.entries(DECOR_ART)) sprites.push({ key, width, height, svg: art });
  sprites.push({ key: 'door_locked', width: 128, height: 64, svg: doorLocked });
  sprites.push({ key: 'door_open', width: 128, height: 64, svg: doorOpen });
  sprites.push({ key: 'sack', width: 40, height: 40, svg: sack });
  sprites.push({ key: 'shadow', width: 64, height: 64, svg: shadow });
  return sprites;
}
