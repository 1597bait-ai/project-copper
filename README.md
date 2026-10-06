# Project Copper

A flash-style top-down stealth game. Dalton strips the school for scrap (copper, brass,
aluminum, steel), hauls it out to the white van to sell, and stays out of Mr. Gravy's sight.
Get caught carrying scrap three times and you're fired.

Runs in any modern browser on **PC and phones** (sideways or upright), and installs as an app
from the browser ("Add to Home Screen").

## Play

| | PC | Phone / tablet | Gamepad |
|---|---|---|---|
| Move | WASD / arrows | drag anywhere on the left side | left stick / d-pad |
| Scrap / unlock | E, Space or Enter | big **SCRAP** button | A |
| Ability | Q or Shift | **HIDE** button | X / B |
| Pause | Esc or P | ❚❚ button | Start |

**The loop:** walk up to a fixture → scrap it (stand still while the bar fills) → carry it to the
van to sell → avoid Mr. Gravy's yellow vision cone while you're carrying or scrapping. Empty
hands are safe. The shift runs 7:00 AM → 3:00 PM (5 real minutes); at noon Mr. Gravy finishes
his coffee and speeds up. Scrap still in your bag at 3:00 is lost.

**Students** wander the halls and classrooms with small blue vision cones. If one sees you
carrying scrap or scrapping, they shout and run to tell Mr. Gravy, who then **sprints** to where
you were seen and searches. Get out of there (or get the scrap to the van) before he arrives.
Dalton's disguise fools students too.

**Map (Lincoln Middle School):** a square building, value rising the deeper you go from the van:
- *Front* (by the entrance): front office, lobby, nurse — desks and lamps, low value.
- *Middle*: four classrooms in the centre (desks, lamps), restrooms and janitor's closet (brass),
  teachers' lounge; the hallway ring around them has fountains and heaters (copper) and is
  Mr. Gravy's patrol.
- *Back* (deepest): Mr. Gravy's office, the storage room (abandoned copper pile), and the
  **locked boiler and mechanical rooms**: one way in and out, the most copper in the school.

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
| `npm test` | Unit tests + "level lint" (every map is checked for unknown things, unreachable loot, a walkable patrol) |
| `npm run e2e` | Plays through the rules, students and map editor in a headless browser on desktop and phones, saving screenshots to `.smoke/` (run `npm run build` first) |
| `npm run map:check` | Checks every map in `src/assets/maps/` and lists its problems |
| `npm run map:format` | Rewrites map files with the current legend at the top |
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
src/entities/      Player, Boss (Mr. Gravy's AI), Student, Fixture, Door
src/world/         map format (legend.ts, mapText.ts), checker (validate.ts), editor rules
                   (editing.ts), level building (World.ts), map list (maps.ts)
src/assets/maps/   the maps themselves, as plain text
src/scenes/        Boot → Menu → Game + Hud → ShiftEnd, and the map Editor
src/input/         keyboard, touch and gamepad all feed one Controls object
src/art/sprites.ts placeholder vector art (SVG), rasterized at startup
tools/             map checker, tileset renderer, e2e test
```

**Screens:** the game is laid out at 1920×1080 and *expands* to fill any screen (no black
bars). The camera zoom and HUD size follow the screen's real pixel density, so phones get a
zoomed-in view, a bigger HUD, a floating joystick and big buttons. Held upright, the menus
stack into a column and the HUD rearranges.

### Edit the map

Maps are plain text: **one character = one tile** (64 px). The file
`src/assets/maps/lincoln.txt` starts with the legend, for example `#` wall, `.` hallway,
`,` classroom carpet, `f` drinking fountain, `c` abandoned copper pile, `P` player start,
`G` Mr. Gravy, `S` student, `VVVV` the van, `L` a locked door, `1`–`9` Mr. Gravy's route in
order. Things stand on the floor next to them, so you never pick a floor for them. A line like
`@ 9,40 Front Office` names the room containing tile x=9, y=40.

Two ways to change it:
- **In the game:** Menu → **MAP EDITOR**. Paint floors and walls (click-drag or finger-drag),
  place things, move the route, undo/redo, zoom and pan. The problems panel tells you what would
  make the map unplayable (no van, loot walled off...). **PLAY** tests it straight away;
  **COPY MAP** copies the text so you can paste it into `lincoln.txt` (or send it over). Your
  work autosaves in the browser.
- **In a text editor:** change the characters, then `npm run map:check`.

`npm test` refuses any shipped map that can't be played.

### Add things

- **New fixture:** add an entry to `src/config/fixtures.ts`, give it a map character in
  `FIXTURE_CHARS` (`src/world/legend.ts`) and art in `FIXTURE_ART` (`src/art/sprites.ts`).
  It shows up in the editor's palette automatically.
- **New map:** add a `.txt` file to `src/assets/maps/` and list it in `src/world/maps.ts`.
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
- Students: they notice you in about 1–2 seconds, run a little slower than Dalton, and Mr. Gravy
  sprints at 1.35× his chase speed when told. After telling, a student leaves you alone for 8s.

## Roadmap

1. ~~First playable: one school, the scrap → van → sell loop, Mr. Gravy, warnings, shift timer~~
2. ~~Students who alert Mr. Gravy, square school, map editor~~ — next: the sleepy coworker (find him to recover a warning)
3. Shop between shifts (boots, tools, bags, keys) and persistent progress
4. Real art, sound and music, more schools
5. App store builds
