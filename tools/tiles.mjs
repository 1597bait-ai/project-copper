// Tileset definition shared by tools/render-art.mjs (draws the PNG) and
// tools/generate-map.mjs (writes the Tiled map). Each tile is a 64x64 SVG snippet.

export const TILE = 64;
export const COLUMNS = 8;

// Deterministic pseudo-random so the PNG is identical every time it is rendered.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function speckles(seed, count, colors, rMin = 0.6, rMax = 1.6, opacity = 0.5) {
  const r = rng(seed);
  let out = '';
  for (let i = 0; i < count; i++) {
    const c = colors[Math.floor(r() * colors.length)];
    out += `<circle cx="${(r() * 64).toFixed(1)}" cy="${(r() * 64).toFixed(1)}" r="${(rMin + r() * (rMax - rMin)).toFixed(2)}" fill="${c}" opacity="${opacity}"/>`;
  }
  return out;
}

const rect = (fill, extra = '') => `<rect width="64" height="64" fill="${fill}" ${extra}/>`;

const asphalt = () => rect('#3b3f45') + speckles(11, 70, ['#4c5057', '#2f3237', '#55595f'], 0.5, 1.4, 0.8);

/** char = the character used for this tile in tools/maps/*.txt; layer = which Tiled layer it goes on. */
export const TILES = [
  {
    name: 'hall floor',
    char: '.',
    layer: 'floor',
    svg: () =>
      rect('#cdc6b4') +
      `<rect width="32" height="32" fill="#d6cfbe"/><rect x="32" y="32" width="32" height="32" fill="#d6cfbe"/>` +
      speckles(1, 40, ['#a89f8a', '#e6e0d2', '#b9b09c'], 0.5, 1.2, 0.7) +
      `<path d="M0 0.5H64M0 32.5H64M0.5 0V64M32.5 0V64" stroke="#b3ab97" stroke-width="1" opacity="0.6"/>`,
  },
  {
    name: 'classroom carpet',
    char: ',',
    layer: 'floor',
    svg: () => rect('#5f6f84') + speckles(2, 120, ['#6b7c92', '#55647a', '#73849a'], 0.6, 1.3, 0.8),
  },
  {
    name: 'restroom tile',
    char: '~',
    layer: 'floor',
    svg: () => {
      let s = rect('#e8eef3');
      for (let i = 0; i <= 64; i += 16) s += `<path d="M${i} 0V64M0 ${i}H64" stroke="#b8c4ce" stroke-width="1.5"/>`;
      return s + speckles(3, 10, ['#d3dce4'], 1, 2, 0.8);
    },
  },
  {
    name: 'boiler concrete',
    char: 'b',
    layer: 'floor',
    svg: () =>
      rect('#56595e') +
      speckles(4, 60, ['#63666b', '#4a4d52', '#6d7075'], 0.6, 1.6, 0.8) +
      `<ellipse cx="44" cy="20" rx="12" ry="7" fill="#45484c" opacity="0.6"/>` +
      `<path d="M6 50 L18 44 L24 52 L34 47" stroke="#3f4246" stroke-width="1.5" fill="none" opacity="0.8"/>`,
  },
  {
    name: 'office carpet',
    char: 'o',
    layer: 'floor',
    svg: () =>
      rect('#7b3c3a') +
      speckles(5, 90, ['#864744', '#6c3331', '#8a4a47'], 0.6, 1.3, 0.8) +
      `<path d="M16 16h2v2h-2zM48 48h2v2h-2zM48 16h2v2h-2zM16 48h2v2h-2z" fill="#a1605c" opacity="0.7"/>`,
  },
  {
    name: 'janitor concrete',
    char: 'j',
    layer: 'floor',
    svg: () => rect('#8d9298') + speckles(6, 60, ['#9aa0a6', '#80868c'], 0.6, 1.5, 0.8),
  },
  { name: 'asphalt', char: 'p', layer: 'floor', svg: asphalt },
  {
    name: 'asphalt parking line',
    char: '|',
    layer: 'floor',
    svg: () => asphalt() + `<rect x="29" y="0" width="6" height="64" fill="#e9e6da" opacity="0.9"/>`,
  },
  {
    name: 'sidewalk',
    char: '_',
    layer: 'floor',
    svg: () =>
      rect('#b9b6ad') +
      speckles(7, 40, ['#a7a49b', '#c8c5bc'], 0.5, 1.2, 0.8) +
      `<path d="M0 0.75H64M0.75 0V64" stroke="#97948b" stroke-width="1.5"/>`,
  },
  {
    name: 'grass',
    char: 'g',
    layer: 'floor',
    svg: () => {
      const r = rng(8);
      let s = rect('#4e8a3d');
      for (let i = 0; i < 70; i++) {
        const x = r() * 64;
        const y = r() * 64;
        s += `<path d="M${x.toFixed(1)} ${y.toFixed(1)} l${(r() * 3 - 1.5).toFixed(1)} -${(3 + r() * 3).toFixed(1)}" stroke="${r() > 0.5 ? '#5f9e4b' : '#3f7431'}" stroke-width="1.4" stroke-linecap="round"/>`;
      }
      return s;
    },
  },
  {
    name: 'interior wall',
    char: '#',
    layer: 'walls',
    collides: true,
    svg: () => rect('#2d3340') + speckles(9, 30, ['#353c4a', '#272c38'], 0.8, 2, 0.9),
  },
  {
    name: 'brick wall',
    char: 'B',
    layer: 'walls',
    collides: true,
    svg: () => {
      let s = rect('#6b2e26');
      for (let row = 0; row < 4; row++) {
        const off = row % 2 ? 16 : 0;
        for (let col = -1; col < 3; col++) {
          const x = col * 32 + off + 1.5;
          const shade = ['#9a4636', '#a34d3c', '#8f3f31'][(row + col + 3) % 3];
          s += `<rect x="${x}" y="${row * 16 + 1.5}" width="29" height="13" rx="1.5" fill="${shade}"/>`;
        }
      }
      return s;
    },
  },
  {
    name: 'fence',
    char: 'F',
    layer: 'walls',
    collides: true,
    svg: () => {
      let s = rect('#4e8a3d');
      for (let i = -64; i < 64; i += 10) {
        s += `<path d="M${i} 0 L${i + 64} 64 M${i + 64} 0 L${i} 64" stroke="#9aa3ab" stroke-width="1.6" opacity="0.9"/>`;
      }
      return s + `<rect x="0" y="0" width="64" height="64" fill="none" stroke="#6f777f" stroke-width="5"/>`;
    },
  },
];

export const tileIndexByChar = Object.fromEntries(TILES.map((t, i) => [t.char, i]));

export const ROWS = Math.ceil(TILES.length / COLUMNS);
export const IMAGE_WIDTH = COLUMNS * TILE;
export const IMAGE_HEIGHT = ROWS * TILE;

export function tilesetSvg() {
  const cells = TILES.map((t, i) => {
    const x = (i % COLUMNS) * TILE;
    const y = Math.floor(i / COLUMNS) * TILE;
    return `<g transform="translate(${x} ${y})"><svg width="64" height="64" viewBox="0 0 64 64" overflow="hidden">${t.svg()}</svg></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}">${cells}</svg>`;
}
