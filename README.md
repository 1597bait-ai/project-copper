# Project Copper

A stealth game in the look of a Game Boy Advance Pokemon game (top-down 3/4 view, chunky
pixel art). Dalton strips the school for scrap (copper, brass, aluminum, steel), hauls it out
to the white van to sell, and stays out of Mr. Gravy's sight. Get caught carrying scrap three
times and you're fired.

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

**Students** hang out in the halls and classrooms with blue vision cones (a bit longer than
Mr. Gravy's). If one sees you holding scrap or scrapping, they **yell at once** (no warning).
If Mr. Gravy is within earshot (14 tiles) he **sprints** to where you were seen. The student
then **follows you slowly** (half their walking pace), yelling again whenever they see you,
and gives up after losing you for a few seconds. Once a yell reaches Mr. Gravy, word gets
around: every student is on **HIGH ALERT** for 45 s (see the banner). They see further, walk
faster, chatter about you, and even get suspicious of an empty-handed Dalton (a '?' fills
up, faster up close, then they yell). Dalton's disguise fools students too.

**Sleepy coworker:** now and then (1 in 4, once a shift) a coworker is napping under a desk
you just scrapped. He wakes with a start and pays you **$50** not to tell the boss. It counts
toward the shift's earnings and shows on the shift report as hush money.

**Map (Lincoln Middle School):** drawn from a floor-plan sketch. Value rises the deeper you go
from the van (out front in the parking lot):
- *Front*: the main entrance and lobby at the bottom centre, then the halls.
- *Top row*: classrooms 1-8 (desks, lamps, heaters), each with a whiteboard, along the top
  hallway. The custodial closet sits in the top-right corner (mop sink, an electric panel, copper).
- *Middle*: classrooms 9-12 and the men's (blue) and women's (pink) restrooms (toilets are brass).
  The halls have fountains and heaters (copper) and are Mr. Gravy's patrol.
- *Right side* (deepest): the **boiler room**, reached only through the narrow corridor along the
  right wall, with the **locked electric panel room** inside it. The copper piles and panels back
  here are **bare bright copper**, worth twice normal copper, so a trip to the back pays the most.

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
| `npm run map:check` | Checks every map in `src/assets/maps/`, lists its problems and prints the loot-depth numbers `npm test` enforces |
| `npm run map:format` | Rewrites map files with the current legend at the top |
| `npm run art` | Re-renders the app icons (`public/icon-*.png`) |

## How it's built

**Phaser 4 + TypeScript + Vite.** It's all code and data, so the whole project is diffable,
testable and can be extended without special tools.

```
src/config/        ← the design board lives here: edit numbers, add content
  fixtures.ts        every scrappable thing (sticky notes: scrap, low/high, recharge, type)
  materials.ts       copper > brass > aluminum > steel prices
  characters.ts      Dalton / Tomothy / Dunkin stat blocks + abilities
  npcs.ts            Mr. Gravy, students, sleepy coworker (speed / awareness) and everything they say
  upgrades.ts        boots, tools, bags, keys (for the shop, not wired up yet)
  balance.ts         every tuning knob: shift length, stat → speed, vision cones, students, high alert,
                     the sleepy coworker...
  decor.ts           plants, trash cans, trees, cars (sizes)
src/systems/       pure game rules, no Phaser (bag, scrapping math, A* pathfinding, vision, clock, save,
                   studentMind / alert / coworker: what students and the coworker decide)
src/entities/      Player, Boss (Mr. Gravy's AI), Student, SleepyCoworker, Fixture, Door;
                   CharacterView draws every person, SpeechBubble the bubbles and '!'/'?'/'$'
src/world/         map format (legend.ts, mapText.ts), checker (validate.ts), editor rules
                   (editing.ts), which tile each cell shows (autotile.ts), level building
                   (World.ts), map list (maps.ts)
src/assets/maps/   the maps themselves, as plain text
src/scenes/        Boot → Menu → Game + Hud → ShiftEnd, and the map Editor
src/input/         keyboard, touch and gamepad all feed one Controls object
src/ui/            theme (Pixelify Sans font, GBA-style windows, buttons), dialog box timing, depth order
src/art/           all the pixel art, drawn in code at boot (no image files): tiles.ts (floors and
                   walls), objects.ts (fixtures, decor, cars, van, doors), characters.ts (everyone's
                   walk / yell / work frames and portraits), ui.ts (HUD icons). pixel.ts has the
                   helpers; sprites.ts is the old vector art, now only a fallback for missing keys
tools/             map checker, app icon renderer, e2e test
```

**Screens:** the game is laid out at 1920×1080 and *expands* to fill any screen (no black
bars). The camera zoom and HUD size follow the screen's real pixel density, so phones get a
zoomed-in view, a bigger HUD, a floating joystick and big buttons. Held upright, the menus
stack into a column and the HUD rearranges.

### Edit the map

Maps are plain text: **one character = one tile** (64 px). The file
`src/assets/maps/lincoln.txt` starts with the legend, for example `#` wall, `.` hallway,
`,` classroom carpet, `W` whiteboard wall, `~`/`^` blue/pink restroom tile, `f` drinking
fountain, `c` abandoned copper pile, `e` electric panel, `*` plant, `u` trash can, `T` tree,
`P` player start, `G` Mr. Gravy, `S` student, `L` a locked door, `1`–`9` Mr. Gravy's route in
order, `C` a parked car (a 2x2 block) and `V` the van (a 4x2 or 2x4 block, e.g. two rows of
`VVVV`). Things stand on the floor next to them, so you never pick a floor for them; put them on
a floor tile beside a wall, not in the wall. Plants, trash cans, trees and cars block walking
but not sight. Mr. Gravy walks the shortest way between route stops, so place stops along
hallways if you want him to stay in them. A line like `@ 40,15 Boiler Room` names the room
containing tile x=40, y=15.

Two ways to change it:
- **In the game:** Menu → **MAP EDITOR**. Paint floors and walls (click-drag or finger-drag),
  place things, move the route, undo/redo, zoom and pan. The problems panel tells you what would
  make the map unplayable (no van, loot walled off...). **PLAY** tests it straight away;
  **COPY MAP** copies the text so you can paste it into `lincoln.txt` (or send it over). Your
  work autosaves in the browser.
- **In a text editor:** change the characters, then `npm run map:check`. Windows line endings
  and "UTF-8 with BOM" are fine. `npm run map:format` refreshes the legend at the top (it keeps
  your own `//` notes and won't touch a map that has typos).

`npm test` refuses any shipped map that can't be played.

### Add things

- **New fixture:** add an entry to `src/config/fixtures.ts`, give it a map character in
  `FIXTURE_CHARS` (`src/world/legend.ts`) and pixel art under the same key in `objectPix()`
  (`src/art/objects.ts`; wall-mounted ones can add a `<id>_side` view). It shows up in the
  editor's palette automatically.
- **New map:** add a `.txt` file to `src/assets/maps/` and list it in `src/world/maps.ts`. For
  now the game plays (and the editor opens) the first map in that list, so put a new map first
  to play it; every listed map is checked by `npm test`.
- **New character:** add to `CHARACTERS` + `CHARACTER_ORDER` and give them a look in `LOOKS`
  (`src/art/characters.ts`: build, skin, hair, hat, clothes colours...). Their walk, yell and work
  frames and portrait are drawn from that. They show up on the crew select screen automatically.
- **What people say:** student yells and chatter, Mr. Gravy's lines and the sleepy coworker's
  lines are in `src/config/npcs.ts`.
- **Real art / sounds:** replace a texture by loading a PNG with the same key in `BootScene`;
  sound effects are synthesized in `src/systems/sfx.ts` until real ones exist.

### Publish

- **GitHub Pages:** `.github/workflows/deploy-pages.yml` deploys on every push to `main`.
  One-time setup: *Settings → Pages → Source: GitHub Actions*.
- **App stores (later):** wrap `dist/` with [Capacitor](https://capacitorjs.com) for iOS/Android,
  or [Tauri](https://tauri.app)/Electron for Steam. No game code changes needed.

## Guesses to confirm

These weren't on the design board, so they're placeholders in `src/config/`:

- Specialties: Dalton = HVAC, Tomothy = plumbing, Dunkin = none.
- Materials: wall heater = copper, toilet and mop sink = brass, abandoned copper pile = bare bright
  copper. Prices are bare bright $20, copper $10, brass $6, aluminum $4, steel $2 per unit.
- Desk and lamp use the two "(name)" sticky notes (scrap 1, 0.8–1.2, recharge 45–60s).
- Scrap times (`workSeconds`), the bag (capacity = 1 + Carry, so Dalton's is 2), vision cone
  size, and the "boss gets faster" point (noon).
- Getting caught = one warning, and Mr. Gravy confiscates whatever is in your bag.
- Abilities last 5–6s with a 20s cooldown.
- Students: they yell the moment they see scrap, Mr. Gravy hears it within 14 tiles and sprints
  at 1.35× his chase speed, followers walk at half pace and give up after 6 s out of sight, then
  leave you alone for 8 s. High alert lasts 45 s; on alert an empty-handed Dalton takes 1.2–3 s
  of staring to get yelled at.
- Sleepy coworker: 1 in 4 desks (once a shift), $50, and it counts as earnings.

## Roadmap

1. ~~First playable: one school, the scrap → van → sell loop, Mr. Gravy, warnings, shift timer~~
2. ~~Students who alert Mr. Gravy, square school, map editor~~
3. ~~Pokemon-style pixel art, the school from the floor-plan sketch, yelling and following students,
   high alert, the sleepy coworker's hush money~~
4. Shop between shifts (boots, tools, bags, keys) and persistent progress
5. Sound and music, more schools
6. App store builds
