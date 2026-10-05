// Builds a Tiled map (JSON) from a text layout in tools/maps/<name>.txt.
//
//   npm run map            -> regenerates every map
//   npm run map school-01  -> one map
//
// The generated file in src/assets/maps/ is a normal Tiled map: open it in Tiled
// (https://www.mapeditor.org) to move things around. If you start editing a map in
// Tiled, stop regenerating it from text or your Tiled edits will be overwritten.
//
// Legend
//   floors:  .  hallway     ,  classroom   ~  restroom    b  boiler room
//            o  office      j  janitor     p  asphalt     |  parking line
//            _  sidewalk    g  grass
//   walls:   #  interior    B  brick       F  fence
//   objects: P  player spawn    V  van (2x4 tiles, this is its top-left)
//            G  boss spawn      1-9  boss patrol route, in order (loops)
//            L  locked door (adjacent L's form one door)
//            f  drinking fountain   h  wall heater   t  toilet   m  mop sink
//            c  abandoned copper pile   d  desk   l  lamp

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { basename } from 'node:path';
import { TILES, TILE, COLUMNS, ROWS, IMAGE_WIDTH, IMAGE_HEIGHT, tileIndexByChar } from './tiles.mjs';

const FIXTURE_CHARS = {
  f: 'drinking_fountain',
  h: 'wall_heater',
  t: 'toilet',
  m: 'mop_sink',
  c: 'abandoned_copper_pile',
  d: 'desk',
  l: 'lamp',
};
const OBJECT_CHARS = new Set(['P', 'V', 'G', 'L', ...'123456789', ...Object.keys(FIXTURE_CHARS)]);
const WALL_CHARS = new Set(TILES.filter((t) => t.layer === 'walls').map((t) => t.char));
const VAN_SIZE = { w: 2, h: 4 };

const ROOM_KINDS = {
  '.': 'hallway',
  ',': 'classroom',
  '~': 'restroom',
  b: 'boiler',
  o: 'office',
  j: 'janitor',
  p: 'outside',
  '|': 'outside',
  _: 'outside',
  g: 'outside',
};

function build(name, text) {
  const rows = text.replace(/\r/g, '').split('\n').filter((r) => r.length);
  const height = rows.length;
  const width = rows[0].length;
  rows.forEach((r, y) => {
    if (r.length !== width) throw new Error(`${name}: row ${y} is ${r.length} wide, expected ${width}`);
  });
  const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 'B' : rows[y][x]);

  // Floor under an object = first neighbouring floor (left, right, up, down).
  const floorChar = (x, y) => {
    const ch = at(x, y);
    if (ch === 'V') return 'p';
    if (!OBJECT_CHARS.has(ch)) return ch;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const n = at(x + dx, y + dy);
      if (!OBJECT_CHARS.has(n) && !WALL_CHARS.has(n)) return n;
    }
    throw new Error(`${name}: no floor next to object at ${x},${y}`);
  };

  const floor = [];
  const walls = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = at(x, y);
      if (WALL_CHARS.has(ch)) {
        floor.push(0);
        walls.push(tileIndexByChar[ch] + 1);
      } else {
        const f = floorChar(x, y);
        if (tileIndexByChar[f] === undefined) throw new Error(`${name}: unknown char '${f}' at ${x},${y}`);
        floor.push(tileIndexByChar[f] + 1);
        walls.push(0);
      }
    }
  }

  let nextId = 1;
  const obj = (o) => ({ id: nextId++, name: '', rotation: 0, visible: true, width: 0, height: 0, ...o });
  const point = (type, x, y, extra = {}) =>
    obj({ type, point: true, x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, ...extra });

  const objects = [];
  const patrol = [];
  const doorCells = new Set();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = at(x, y);
      if (ch === 'P') objects.push(point('player_spawn', x, y));
      else if (ch === 'G') objects.push(point('boss_spawn', x, y, { name: 'mr_gravy' }));
      else if (ch === 'V')
        objects.push(obj({ type: 'van', x: x * TILE, y: y * TILE, width: VAN_SIZE.w * TILE, height: VAN_SIZE.h * TILE }));
      else if (FIXTURE_CHARS[ch]) objects.push(point('fixture', x, y, { name: FIXTURE_CHARS[ch] }));
      else if (/[1-9]/.test(ch)) patrol.push({ order: Number(ch), x, y });
      else if (ch === 'L' && !doorCells.has(`${x},${y}`)) {
        // Grow the door right or down over adjacent L's.
        let w = 1;
        let h = 1;
        while (at(x + w, y) === 'L') w++;
        if (w === 1) while (at(x, y + h) === 'L') h++;
        for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) doorCells.add(`${x + i},${y + j}`);
        objects.push(
          obj({
            type: 'door',
            name: 'Locked Door',
            x: x * TILE,
            y: y * TILE,
            width: w * TILE,
            height: h * TILE,
            properties: [{ name: 'locked', type: 'bool', value: true }],
          }),
        );
      }
    }
  }
  if (patrol.length) {
    patrol.sort((a, b) => a.order - b.order);
    const ox = (patrol[0].x + 0.5) * TILE;
    const oy = (patrol[0].y + 0.5) * TILE;
    objects.push(
      obj({
        type: 'patrol',
        name: 'mr_gravy',
        x: ox,
        y: oy,
        polyline: patrol.map((p) => ({ x: (p.x + 0.5) * TILE - ox, y: (p.y + 0.5) * TILE - oy })),
      }),
    );
  }

  // Rooms: flood-fill connected floor of the same kind, export bounding boxes.
  const seen = new Uint8Array(width * height);
  const regions = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (seen[y * width + x] || WALL_CHARS.has(at(x, y)) || at(x, y) === 'L') continue;
      const kind = ROOM_KINDS[floorChar(x, y)];
      const stack = [[x, y]];
      seen[y * width + x] = 1;
      let [minX, minY, maxX, maxY] = [x, y, x, y];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || seen[ny * width + nx]) continue;
          const ch = at(nx, ny);
          if (WALL_CHARS.has(ch) || ch === 'L' || ROOM_KINDS[floorChar(nx, ny)] !== kind) continue;
          seen[ny * width + nx] = 1;
          stack.push([nx, ny]);
        }
      }
      regions.push({ kind, minX, minY, maxX, maxY });
    }
  }
  regions.sort((a, b) => a.minY - b.minY || a.minX - b.minX);
  const counters = {};
  const roomName = (kind) => {
    const n = (counters[kind] = (counters[kind] ?? 0) + 1);
    switch (kind) {
      case 'classroom':
        return `Room ${100 + n}`;
      case 'restroom':
        return n === 1 ? "Boys' Restroom" : n === 2 ? "Girls' Restroom" : `Restroom ${n}`;
      case 'boiler':
        return 'Boiler Room';
      case 'office':
        return "Mr. Gravy's Office";
      case 'janitor':
        return "Janitor's Closet";
      case 'hallway':
        return 'Hallway';
      default:
        return 'Parking Lot';
    }
  };
  const rooms = regions.map((r) =>
    obj({
      type: 'room',
      name: roomName(r.kind),
      x: r.minX * TILE,
      y: r.minY * TILE,
      width: (r.maxX - r.minX + 1) * TILE,
      height: (r.maxY - r.minY + 1) * TILE,
      properties: [{ name: 'kind', type: 'string', value: r.kind }],
    }),
  );

  const tileLayer = (id, layerName, data) => ({
    id,
    name: layerName,
    type: 'tilelayer',
    width,
    height,
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
    data,
  });
  const objectLayer = (id, layerName, objs) => ({
    id,
    name: layerName,
    type: 'objectgroup',
    draworder: 'topdown',
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
    objects: objs,
  });

  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.11.0',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    compressionlevel: -1,
    width,
    height,
    tilewidth: TILE,
    tileheight: TILE,
    nextlayerid: 5,
    nextobjectid: nextId,
    layers: [
      tileLayer(1, 'floor', floor),
      tileLayer(2, 'walls', walls),
      objectLayer(3, 'rooms', rooms),
      objectLayer(4, 'objects', objects),
    ],
    tilesets: [
      {
        firstgid: 1,
        name: 'school',
        image: '../tiles/school-tiles.png',
        imagewidth: IMAGE_WIDTH,
        imageheight: IMAGE_HEIGHT,
        tilewidth: TILE,
        tileheight: TILE,
        columns: COLUMNS,
        tilecount: COLUMNS * ROWS,
        margin: 0,
        spacing: 0,
        tiles: TILES.map((t, id) => ({
          id,
          properties: [
            { name: 'name', type: 'string', value: t.name },
            ...(t.collides ? [{ name: 'collides', type: 'bool', value: true }] : []),
          ],
        })),
      },
    ],
  };
}

const only = process.argv[2];
const files = (await readdir(new URL('./maps/', import.meta.url))).filter(
  (f) => f.endsWith('.txt') && (!only || basename(f, '.txt') === only),
);
for (const file of files) {
  const name = basename(file, '.txt');
  const text = await readFile(new URL(`./maps/${file}`, import.meta.url), 'utf8');
  const map = build(name, text);
  const out = new URL(`../src/assets/maps/${name}.json`, import.meta.url);
  await writeFile(out, JSON.stringify(map, null, 1) + '\n');
  const counts = {};
  for (const o of map.layers[3].objects) counts[o.type] = (counts[o.type] ?? 0) + 1;
  console.log(`${name}: ${map.width}x${map.height}`, counts, `rooms: ${map.layers[2].objects.map((r) => r.name).join(', ')}`);
}
