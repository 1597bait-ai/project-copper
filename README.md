# Project Copper

A flash-style top-down stealth game. Dalton strips the school for scrap (copper, brass,
aluminum, steel), hauls it out to the white van to sell, and stays out of Mr. Gravy's sight.
Get caught carrying scrap three times and you're fired.

Runs in any modern browser on **PC and phones** (landscape), and installs as an app from the
browser ("Add to Home Screen").

## Play

| | PC | Phone / tablet | Gamepad |
|---|---|---|---|
| Move | WASD / arrows | drag anywhere on the left side | left stick / d-pad |
| Scrap / unlock | E, Space or Enter | big **SCRAP** button | A |
| Ability | Q or Shift | **HIDE** button | X / B |
| Pause | Esc or P | ❚❚ button | Start |

**The loop:** walk up to a fixture → scrap it (stand still while the bar fills) → carry it to the
van to sell → avoid Mr. Gravy's yellow vision cone while you're carrying or scrapping. Empty
hands are safe. The shift runs 7:00 AM → 3:00 PM (4 real minutes); at noon Mr. Gravy finishes
his coffee and speeds up. Scrap still in your bag at 3:00 is lost.

**Map:** classrooms (desks and lamps, low value, quiet), hallway (fountains and heaters,
higher value, Mr. Gravy's patrol), restrooms and the janitor's closet (brass), and the locked
**boiler room**: one way in and out, but it has the abandoned copper pile.

**Crew:** Dalton (fast, *Act Like a Student*: hides carried scrap for 5s), Tomothy (slow,
best at repair, *Act Like You're Working*: scrapping looks legit for 6s), Dunkin (carries the most).

## Run it locally

Needs [Node.js](https://nodejs.org) 20+.

```bash
npm install
npm run dev        # http://localhost:5173 (also on your Wi-Fi, so you can open it on your phone)
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with live reload |
| `npm run build` | Production build in `dist/` (upload anywhere: GitHub Pages, itch.io, Netlify) |
| `npm run build:single` | Whole game in one `dist-single/index.html` (works offline, easy to share) |
| `npm test` | Unit tests + "level lint" (every map is checked for unknown fixtures, unreachable spots, a walkable patrol) |
| `npm run e2e` | Plays through the rules in a headless browser on desktop + phone and saves screenshots to `.smoke/` (run `npm run build` first) |
| `npm run map` | Rebuilds Tiled maps from the text layouts in `tools/maps/` |
| `npm run art` | Re-renders the tileset PNG and app icons |

## How it's built

**Phaser 4 + TypeScript + Vite.** It's all code and data, so the whole project is diffable,
testable and can be extended without special tools.

```
src/config/        ← the design board lives here: edit numbers, add content
  fixtures.ts        every scrappable thing (sticky notes: scrap, low/high, recharge, type)
  materials.ts       copper > brass > aluminum > steel prices
  characters.ts      Dalton / Tomothy / Dunkin stat blocks + abilities
  npcs.ts            Mr. Gravy, students (speed / awareness)
  upgrades.ts        boots, tools, bags, keys (for the shop, not wired up yet)
  balance.ts         every tuning knob: shift length, stat → speed, vision cone size, catch timing...
src/systems/       pure game rules, no Phaser (bag, scrapping math, A* pathfinding, vision, clock, save)
src/entities/      Player, Boss (Mr. Gravy's AI), Fixture, Door
src/world/         map loading (World.ts), map list (maps.ts), level lint test
src/scenes/        Boot → Menu → Game + Hud → ShiftEnd
src/input/         keyboard, touch and gamepad all feed one Controls object
src/art/sprites.ts placeholder vector art (SVG), rasterized at startup
tools/             map generator, tileset renderer, e2e test
```

**Screens:** the game is laid out at 1920×1080 and *expands* to fill any landscape screen
(no black bars). Phones get a zoomed-in camera, bigger HUD, a floating joystick and big buttons.
Portrait phones are asked to rotate.

### Add things

- **New fixture:** add an entry to `src/config/fixtures.ts`, add its art to `FIXTURE_ART` in
  `src/art/sprites.ts`, then place it on a map (Tiled: object layer `objects`, type `fixture`,
  name = the id). `npm test` fails if a map uses an id that doesn't exist.
- **New map:** either draw it in [Tiled](https://www.mapeditor.org) (copy
  `src/assets/maps/school-01.json` as a template), or write a text layout in `tools/maps/` (see
  the legend in `tools/generate-map.mjs`) and run `npm run map`. Then add it to
  `src/world/maps.ts`. Once you start editing a map in Tiled, stop regenerating it from text.
- **New character:** add to `CHARACTERS` + `CHARACTER_ORDER` and give them a look in `sprites.ts`.
  They show up on the crew select screen automatically.
- **Real art / sounds:** replace a sprite by loading a PNG with the same texture key in
  `BootScene`; sound effects are synthesized in `src/systems/sfx.ts` until real ones exist.

### Publish

- **GitHub Pages:** `.github/workflows/deploy-pages.yml` deploys on every push to `main`.
  One-time setup: *Settings → Pages → Source: GitHub Actions*.
- **App stores (later):** wrap `dist/` with [Capacitor](https://capacitorjs.com) for iOS/Android,
  or [Tauri](https://tauri.app)/Electron for Steam. No game code changes needed.

## Guesses to confirm

These weren't on the design board, so they're placeholders in `src/config/`:

- Specialties: Dalton = HVAC, Tomothy = plumbing, Dunkin = none.
- Materials: wall heater = copper, toilet and mop sink = brass. Prices are copper $10, brass $6,
  aluminum $4, steel $2 per unit.
- Desk and lamp use the two "(name)" sticky notes (scrap 1, 0.8–1.2, recharge 45–60s).
- Scrap times (`workSeconds`), the bag (capacity = 1 + Carry, so Dalton's is 2), vision cone
  size, and the "boss gets faster" point (noon).
- Getting caught = one warning, and Mr. Gravy confiscates whatever is in your bag.
- Abilities last 5–6s with a 20s cooldown.

## Roadmap

1. ~~First playable: one school, the scrap → van → sell loop, Mr. Gravy, warnings, shift timer~~
2. Students who alert Mr. Gravy, the sleepy coworker (find him to recover a warning)
3. Shop between shifts (boots, tools, bags, keys) and persistent progress
4. Real art, sound and music, more schools
5. App store builds
