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
- *Middle*: classrooms 9-12 and the men's (blue) and women's (pink) restrooms (sinks by the doors,
  toilets are brass).
  The halls have fountains and heaters (copper) and are Mr. Gravy's patrol.
- *Right side* (deepest): the **boiler room** (boiler, generator and pressure gauges), reached only
  through the narrow corridor along the right wall, with the **locked electric panel room** inside
  it. The copper piles and panels back here are **bare bright copper**, worth twice normal copper,
  so a trip to the back pays the most.

**Crew:** Dalton (fast, *Act Like a Student*: hides carried scrap for 5s), Tomothy (slow,
best at repair, *Act Like You're Working*: scrapping looks legit for 6s), Dunkin (carries the most).

## Run it locally

Needs [Node.js](https://nodejs.org) 22.18 or newer (the page tools and the e2e test load TypeScript directly).

```bash
npm install
npm run dev        # http://localhost:5173 (also on your Wi-Fi, so you can open it on your phone)
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with live reload |
| `npm run build` | Production build in `dist/` (upload anywhere: GitHub Pages, itch.io, Netlify) |
| `npm run build:single` | Whole game in one `dist-single/index.html` (works offline, easy to share) |
| `npm run artifact` | The game page for claude.ai, `.tmp-artifact/project-copper.html`: the single-file build with the repo's balance inside (see [Copper Studio](#copper-studio-balancing-without-code)) |
| `npm test` | Unit tests + "level lint" (every map is checked for unknown things, unreachable loot, a walkable patrol) |
| `npm run e2e` | Plays through the rules, students, map editor and Copper Studio (save round trips on the claude.ai page too, two owners saving at once among them) in a headless browser on desktop and phones, saving screenshots to `.smoke/` (run `npm run build` and `npm run build:single` first) |
| `npm run map:check` | Checks every map in `src/assets/maps/`, lists its problems and prints the loot-depth numbers `npm test` enforces |
| `npm run map:format` | Rewrites map files with the current legend at the top |
| `npm run art` | Re-renders the app icons (`public/icon-*.png`) |

## Copper Studio: balancing without code

Copper Studio is the developer's app for tuning the game, built into the game page itself. It
edits every value listed in `src/config/schema.ts`: the crew (stats, trades, abilities), Mr. Gravy,
the students, the sleepy coworker, scrap prices and every fixture, the shift rules, what people
say, and the school map (its **Map** tab is the map editor). Nothing in it needs Claude: change a
number, play test it, save it.

**Opening it**
- *The shared game on claude.ai:* for its owner (or an editor) the menu shows **STUDIO** next to
  START SHIFT (under it on a phone held upright). Testers don't get the button.
- *Locally:* `npm run dev`, then STUDIO on the menu, or http://localhost:5173/#studio.
- *Any other copy* (GitHub Pages, a downloaded file): add `#studio` to the address. The Studio
  opens with saving off, which is still handy to try changes, play test them and Export them.

**Working in it.** Each section is a tab (search finds any setting by name). Settings show what
they mean in play ("walks 3.2 tiles/s", "sees 5 tiles, 80° cone") and stay within safe limits;
rarely needed ones sit under "More settings". Changed settings are marked *Unsaved*, with **Undo**
(back to the saved value) and **Reset** (back to the value the code ships with). The changes are a
draft kept in this browser until you save; tabs of the game open side by side (the chat's preview
and the shared link, say) share it, each taking in the other's edits. A browser that blocks site
data can't keep it: the Studio says so, and Export keeps a copy. **▶ Play test** plays a shift
with the draft and the crew member picked beside it (it doesn't count toward your best shift or
totals); **◀ STUDIO** comes back. The Map tab paints floors and walls, places things and moves
Mr. Gravy's route; its problems panel says what would make the map unplayable, and a map with
problems can't be play tested or saved.

**Save to game** saves the draft as the next version, with a note ("Gravy slower: testers said
he's too fast"):
- *On claude.ai* the game page republishes itself with the new balance inside. Everyone who
  opens the link gets it from then on, signed in or not, and copies that are open reload to it.
  Only the owner or an editor can save. If someone saved a newer version first (another device,
  or Claude), the save is refused and the page reloads to theirs with your edits kept on top.
- *With `npm run dev`* it writes `src/config/tuning.json` (and the map into
  `src/assets/maps/lincoln.txt`): commit them to keep it. A save made from an older version than
  the repo's (another tab saved first) is refused; the page reloads to the latest version with
  your edits kept on top. The dev server only takes a map the game can play, and only from the
  game page (or a tool on the same computer).
- *Anywhere else* (GitHub Pages, a downloaded copy) saving is off: export the tuning file instead.

**The balance version.** Every save is a new version. The menu and the end-of-shift screen show
it in the top-left corner, "Balance v3 · 12 Oct 2026" (nothing for the shipped values), so testers
can say which balance they played when they report something. During a play test that corner says
"Play test · draft" instead.

**History** lists the last 30 saves with their notes and changes; **Load into draft** brings any
of them back, on the map it was saved with (or the shipped values), and Save to game makes it live
again. The **⋯** menu has **Export…** (download or copy the draft as a tuning file, to keep or
send: with unsaved changes it is a draft of the saved version, `copper-tuning-draft-from-v3.json`,
never a version of its own; with none, the saved version itself), **Import…** (load a tuning file
into the draft, e.g. one a tester sent), reset everything to the shipped values, discard the
draft, and Exit studio (back to the game, running the saved version).

**Saved balance and code changes.** Balance saved on claude.ai lives in the published page, not
in the repo, and publishing the game again replaces that page. So when Claude next changes the
code, it first pulls the saved balance from the live page, so nothing is lost:
1. Read the published artifact into a file (the Artifact tool's read action), then
   `node tools/artifact-page.mjs pull <that file>`: it writes `src/config/tuning.json` (values and
   history) and the map into `src/assets/maps/lincoln.txt`, and prints the version, note and
   changes. It refuses a page whose balance is older than the repo's or was saved separately from
   it (`--force` overrides). A version exported from the Studio works too, but not an exported
   draft (import that in the Studio and save it).
2. Commit that, make the code change, then `npm run artifact` and publish
   `.tmp-artifact/project-copper.html` to the **same** artifact, declaring the capabilities it
   prints (`{"artifact":{},"downloads":true}`), so the Studio can keep saving into it.

**Making a new number tunable:** add it to its config file, then a field for it in
`src/config/schema.ts` (label, limits, unit, an optional preview). The Studio builds its forms
from that list (the unit tests list config numbers that have no field).

## How it's built

**Phaser 4 + TypeScript + Vite.** It's all code and data, so the whole project is diffable,
testable and can be extended without special tools.

```
src/config/        ← the design board lives here: add content (balance numbers are tuned in Copper Studio)
  fixtures.ts        every scrappable thing (sticky notes: scrap, low/high, recharge, type)
  materials.ts       copper > brass > aluminum > steel prices
  characters.ts      Dalton / Tomothy / Dunkin stat blocks + abilities
  npcs.ts            Mr. Gravy, students, sleepy coworker (speed / awareness) and everything they say
  upgrades.ts        boots, tools, bags, keys (for the shop, not wired up yet)
  balance.ts         every tuning knob as data (shift length, stat → speed, vision cones, students, high
                     alert, the sleepy coworker...) plus the small rules that turn stats into numbers
                     (tilesPerSecond, bagCapacity, Mr. Gravy's vision)
  schema.ts          everything Copper Studio can change: labels, help, limits, units, previews
  tuning.ts          applies the saved balance (a tuning file) to the config above at boot
  tuning.json        the saved balance: what differs from the code's values, and the save history
  decor.ts           decorations: plants, trash cans, trees, cars, boiler, generator, sinks (sizes)
src/systems/       pure game rules, no Phaser (bag, scrapping math, A* pathfinding, vision, clock, save,
                   studentMind / alert / coworker: what students and the coworker decide)
src/entities/      Player, Boss (Mr. Gravy's AI), Student, SleepyCoworker, Fixture, Door;
                   CharacterView draws every person, SpeechBubble the bubbles and '!'/'?'/'$'
src/world/         map format (legend.ts, mapText.ts), checker (validate.ts), editor rules
                   (editing.ts), which tile each cell shows (autotile.ts), level building
                   (World.ts), map list (maps.ts)
src/assets/maps/   the maps themselves, as plain text
src/scenes/        Boot → Menu → Game + Hud → ShiftEnd, and the map Editor (Copper Studio's Map tab)
src/studio/        Copper Studio: forms built from the schema, the draft, play tests, saving
                   (save.ts: republish on claude.ai, repo files on the dev server) and the page format
src/input/         keyboard, touch and gamepad all feed one Controls object
src/ui/            theme (fonts, GBA-style windows, buttons), dialog box timing, depth order, the
                   balance label, crew card stat pips, counts in words
src/assets/fonts/  the pixel fonts, part of the game (no network needed): Pixelify Sans for text and
                   Jersey 15 for digits (Pixelify's 5 looks like an S), with their licences (OFL)
src/art/           all the pixel art, drawn in code at boot (no image files): tiles.ts (floors and
                   walls), objects.ts (fixtures, decorations, cars, van, doors, recharge clock),
                   characters.ts (everyone's walk / yell / work frames and portraits), ui.ts (HUD
                   icons). pixel.ts has the helpers
tools/             map checker, app icon renderer, e2e test, the dev server's save endpoint
                   (vite-copper.mjs), and the claude.ai page builder and pull (artifact-page.mjs)
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
`s` sink, `Q` pressure gauges, `P` player start, `G` Mr. Gravy, `S` student, `L` a locked door,
`1`–`9` Mr. Gravy's route in order, and blocks for big things: `C` a parked car (2x2), `O` the
boiler (2x2), `Z` a generator (2x1) and `V` the van (4x2 or 2x4, e.g. two rows of `VVVV`).
Things stand on the floor next to them, so you never pick a floor for them; put them on a floor
tile beside a wall, not in the wall. Decorations (plants, trash cans, trees, cars, the boiler
room's machines, sinks) block walking but not sight, so one typed into a wall line would be a
window through it (`npm run map:check` warns about that). Mr. Gravy walks the shortest way
between route stops, so place stops along hallways if you want him to stay in them. A line like
`@ 40,15 Boiler Room` names the room containing tile x=40, y=15.

Two ways to change it:
- **In Copper Studio:** its **Map** tab. Paint floors and walls (click-drag or finger-drag),
  place things, move the route, undo/redo, zoom and pan. The problems panel tells you what would
  make the map unplayable (no van, loot walled off...). **PLAY** play tests it straight away;
  **COPY MAP** copies the text. Your work is part of the Studio's draft (kept in the browser), and
  **Save to game** saves it with the rest: on the dev server straight into `lincoln.txt`, keeping
  the file's own `//` notes.
- **In a text editor:** change the characters, then `npm run map:check`. Windows line endings
  and "UTF-8 with BOM" are fine. `npm run map:format` refreshes the legend at the top (it keeps
  your own `//` notes and won't touch a map that has typos).

`npm test` refuses any shipped map that can't be played.

### Add things

- **New fixture:** add an entry to `src/config/fixtures.ts`, give it a map character in
  `FIXTURE_CHARS` (`src/world/legend.ts`) and pixel art under the same key in `objectPix()`
  (`src/art/objects.ts`). Wall-mounted ones also need a `<id>_side` view, drawn against a wall on
  its left (it's mirrored for a wall on the right); `npm test` checks every fixture has its art.
  It shows up in the editor's palette automatically.
- **New decoration:** the same, with `src/config/decor.ts` (its size in tiles) and `DECOR_CHARS`.
  Big ones are written in the map as a filled block of their character, and their art is as wide
  as the block (16 art pixels per tile) and may reach up over the tile above.
- **New map:** add a `.txt` file to `src/assets/maps/` and list it in `src/world/maps.ts`. For
  now the game plays (and the editor opens) the first map in that list, so put a new map first
  to play it (a map saved in Copper Studio on claude.ai is played instead, until it is pulled into
  the repo); every listed map is checked by `npm test`.
- **New character:** add to `CHARACTERS` + `CHARACTER_ORDER` and give them a look in `LOOKS`
  (`src/art/characters.ts`: build, skin, hair, hat, clothes colours...). Their walk, yell and work
  frames and portrait are drawn from that. They show up on the crew select screen automatically.
- **What people say:** student yells and chatter, Mr. Gravy's lines and the sleepy coworker's
  lines are in `src/config/npcs.ts`.
- **Real art:** load a PNG with the same key in a `preload()` in `src/scenes/BootScene.ts` (e.g.
  `this.load.image('desk', 'art/desk.png')`): the generated art leaves any key that's already
  loaded alone. Images are at screen size (a tile is 64 px; the generated art is 16-pixel art
  drawn at 4x) and stand on the bottom of their tile. Fixtures and decorations are one image
  named by their id (wall-mounted fixtures also `<id>_side`, see above). People need three:
  `<key>` (standing, facing you), `<key>_big` (a portrait) and `<key>_sheet`, an atlas
  (`this.load.atlas`) with frames `down-0`, `down-1`, `down-2`, then the same for `up`, `left` and
  `right` (0 standing, 1 and 2 walking steps), and, if they have them, `<facing>-yell`,
  `<facing>-work-0`/`-1` (hammering) and `sleep-0`/`-1`; each frame has an empty 4 px border.
  The floors and walls are one texture, `tileset-school`, laid out like the generated one
  (`src/world/autotile.ts`).
- **Sounds:** synthesized in `src/systems/sfx.ts` until real ones exist.

### Publish

- **claude.ai (the link testers play):** `npm run artifact`, then publish
  `.tmp-artifact/project-copper.html` as an artifact with the capabilities it prints, and share its
  link. Republish to the same artifact, after pulling any balance saved there (see Copper Studio).
- **GitHub Pages:** `.github/workflows/deploy-pages.yml` deploys on every push to `main`.
  One-time setup: *Settings → Pages → Source: GitHub Actions*.
- **App stores (later):** wrap `dist/` with [Capacitor](https://capacitorjs.com) for iOS/Android,
  or [Tauri](https://tauri.app)/Electron for Steam. No game code changes needed.

## Guesses to confirm

These weren't on the design board, so they're placeholders in `src/config/` (all of them can be
tuned in Copper Studio):

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
4. ~~Copper Studio: every number, line and the map tunable from the game page, saved into the shared
   game for testers without touching code~~
5. Shop between shifts (boots, tools, bags, keys) and persistent progress
6. Sound and music, more schools
7. App store builds
