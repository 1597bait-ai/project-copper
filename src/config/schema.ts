// Everything Copper Studio can change, with labels, help, units and safe limits. The Studio builds
// its forms from this list, and tuning files are checked against it (src/config/tuning.ts), so a
// value can only be tuned once it is listed here. To make a new number tunable: add it to its
// config file, then add a field here (the unit tests list config numbers that have no field).
//
// Previews show what a value means in play ("walks 3.2 tiles/s"). They read the values being
// edited, never the live config.

import { CHARACTER_ORDER, CHARACTERS, ABILITIES } from './characters';
import { FIXTURES } from './fixtures';
import { MATERIAL_ORDER, MATERIALS } from './materials';
import type { Values } from './tuning';

export interface Option {
  value: string | null;
  label: string;
}

export type FieldKind =
  /** A number, clamped to [min, max] and rounded to `step` (whole numbers when `int`). */
  | { type: 'number'; min: number; max: number; step: number; unit?: string; int?: boolean; percent?: boolean }
  /** A [low, high] pair, low <= high. */
  | { type: 'range'; min: number; max: number; step: number; unit?: string }
  /** A [low, high] pair, or null for "none" (a fixture's random yield range). */
  | { type: 'optionalRange'; min: number; max: number; step: number; unit?: string }
  /** One line of text. */
  | { type: 'text'; maxLength: number; placeholder?: string }
  /** Several lines (one is picked at random in the game). */
  | { type: 'lines'; maxLength: number; maxItems: number }
  /** One of a fixed list. */
  | { type: 'choice'; options: Option[] }
  /** Any number of a fixed list (at least one). */
  | { type: 'set'; options: Option[] };

export interface Field {
  /** Where the value lives, e.g. "balance.boss.sprintFactor" (see LIVE in tuning.ts). */
  path: string;
  label: string;
  help?: string;
  kind: FieldKind;
  /** What the value means in play, from the values being edited. */
  preview?: (v: Values) => string;
  /** Rarely needed: shown under "More settings". */
  advanced?: boolean;
  /** "Mr. Gravy › Catching you" — filled in from its section and group. */
  where: string;
}

export interface FieldGroup {
  id: string;
  title: string;
  /** Show the group under this name from the values being edited (a renamed character). */
  titlePath?: string;
  help?: string;
  fields: Field[];
}

export interface Section {
  id: string;
  title: string;
  blurb: string;
  groups: FieldGroup[];
}

// ---- helpers for previews ------------------------------------------------------------

const fmt = (n: number, digits = 1) => (Number.isInteger(n) ? String(n) : n.toFixed(digits).replace(/\.?0+$/, ''));
const money = (n: number) => `$${n.toFixed(2)}`;
const speedOf = (v: Values, stat: number) => v.balance.movement.baseTilesPerSecond + v.balance.movement.tilesPerSecondPerSpeed * stat;
const bagOf = (v: Values, carry: number) => v.balance.bag.baseCapacity + v.balance.bag.capacityPerCarry * carry;
const gravyRange = (v: Values) => v.balance.boss.visionRangeBaseTiles + v.balance.boss.visionRangeTilesPerAwareness * v.npcs.mr_gravy.awareness;
const gravyAngle = (v: Values) => 2 * (v.balance.boss.visionHalfAngleBaseDeg + v.balance.boss.visionHalfAngleDegPerAwareness * v.npcs.mr_gravy.awareness);
/** Seconds a character takes to strip a fixture (same rule as src/systems/scrapping.ts). */
function stripSeconds(v: Values, characterId: string, fixtureId: string): number {
  const c = v.characters[characterId];
  const f = v.fixtures[fixtureId];
  const bonus = c.specialty !== null && c.specialty === f.type ? v.balance.repair.specialtyBonus : v.balance.repair.otherBonus;
  return (f.workSeconds * v.balance.repair.reference) / Math.max(0.25, c.stats.repair + bonus);
}
const crewLine = (v: Values, each: (id: string) => string) => CHARACTER_ORDER.map((id) => `${v.characters[id].name} ${each(id)}`).join(' · ');

// ---- option lists ----------------------------------------------------------------------

const TRADE_OPTIONS: Option[] = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'free', label: 'Free (loose scrap)' },
  { value: 'general', label: 'General' },
];
const ROOM_OPTIONS: Option[] = [
  { value: 'hallway', label: 'Hallways' },
  { value: 'classroom', label: 'Classrooms' },
  { value: 'restroom', label: 'Restrooms' },
  { value: 'lobby', label: 'Lobby / entrance' },
  { value: 'lounge', label: "Teachers' lounge" },
  { value: 'office', label: 'Office' },
  { value: 'boiler', label: 'Boiler / electric rooms' },
  { value: 'janitor', label: 'Custodial closet' },
  { value: 'storage', label: 'Storage' },
  { value: 'outside', label: 'Outside' },
];
const TIER_OPTIONS: Option[] = ['very high', 'high', 'medium', 'low'].map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }));
const materialOptions = (): Option[] => MATERIAL_ORDER.map((id) => ({ value: id, label: MATERIALS[id].name }));
const abilityOptions = (): Option[] => [{ value: null, label: 'None' }, ...Object.values(ABILITIES).map((a) => ({ value: a.id, label: a.name }))];
const fixtureOptions = (): Option[] => Object.values(FIXTURES).map((f) => ({ value: f.id, label: f.name }));

// ---- field builders ---------------------------------------------------------------------

type Draft = Omit<Field, 'where'>;
const num = (path: string, label: string, min: number, max: number, step: number, extra: Partial<Draft> & { unit?: string; int?: boolean; percent?: boolean } = {}): Draft => {
  const { unit, int, percent, ...rest } = extra;
  return { path, label, kind: { type: 'number', min, max, step, unit, int, percent }, ...rest };
};
const range = (path: string, label: string, min: number, max: number, step: number, unit?: string, extra: Partial<Draft> = {}): Draft => ({
  path,
  label,
  kind: { type: 'range', min, max, step, unit },
  ...extra,
});
const text = (path: string, label: string, maxLength: number, extra: Partial<Draft> = {}): Draft => ({ path, label, kind: { type: 'text', maxLength }, ...extra });
const lines = (path: string, label: string, help?: string): Draft => ({ path, label, help, kind: { type: 'lines', maxLength: 90, maxItems: 20 } });

interface GroupDraft extends Omit<FieldGroup, 'fields'> {
  fields: Draft[];
}

function section(id: string, title: string, blurb: string, groups: GroupDraft[]): Section {
  return {
    id,
    title,
    blurb,
    groups: groups.map((g) => ({ ...g, fields: g.fields.map((f) => ({ ...f, where: `${title} › ${g.title}` })) })),
  };
}

// ---- the sections ----------------------------------------------------------------------

const crew = section(
  'crew',
  'Crew',
  'Dalton, Tomothy and Dunkin, their abilities, and the rules that turn stats into walking speed, bag size and scrapping time.',
  [
    ...CHARACTER_ORDER.map(
      (id): GroupDraft => ({
        id: `crew.${id}`,
        title: CHARACTERS[id].name,
        titlePath: `characters.${id}.name`,
        fields: [
          text(`characters.${id}.name`, 'Name', 20),
          text(`characters.${id}.tagline`, 'Tagline', 48, { help: 'The line under the name on the crew card.' }),
          num(`characters.${id}.stats.speed`, 'Speed', 0, 8, 0.5, { preview: (v) => `walks ${fmt(speedOf(v, v.characters[id].stats.speed))} tiles/s` }),
          num(`characters.${id}.stats.repair`, 'Repair', 0, 8, 0.5, { preview: (v) => `strips a desk in ${fmt(stripSeconds(v, id, 'desk'))} s, a copper pile in ${fmt(stripSeconds(v, id, 'abandoned_copper_pile'))} s` }),
          num(`characters.${id}.stats.carry`, 'Carry', 0, 8, 0.5, { preview: (v) => `bag holds ${fmt(bagOf(v, v.characters[id].stats.carry), 2)} units of scrap` }),
          {
            path: `characters.${id}.specialty`,
            label: 'Trade',
            help: 'Strips fixtures of this trade faster (the specialty bonus below).',
            kind: { type: 'choice', options: [{ value: null, label: 'None' }, ...TRADE_OPTIONS] },
          },
          { path: `characters.${id}.ability`, label: 'Ability', kind: { type: 'choice', options: abilityOptions() } },
        ],
      }),
    ),
    {
      id: 'crew.rules',
      title: 'Stats to numbers',
      help: 'The same walking rule is used for Mr. Gravy and the students.',
      fields: [
        num('balance.movement.baseTilesPerSecond', 'Walking speed at stat 0', 0.2, 6, 0.1, { unit: 'tiles/s', preview: (v) => crewLine(v, (id) => `${fmt(speedOf(v, v.characters[id].stats.speed))}`) + ' tiles/s' }),
        num('balance.movement.tilesPerSecondPerSpeed', 'Extra speed per Speed point', 0, 3, 0.05, { unit: 'tiles/s' }),
        num('balance.bag.baseCapacity', 'Bag size at Carry 0', 0, 10, 0.25, { unit: 'units', preview: (v) => crewLine(v, (id) => `${fmt(bagOf(v, v.characters[id].stats.carry), 2)}`) + ' units' }),
        num('balance.bag.capacityPerCarry', 'Extra bag size per Carry point', 0, 5, 0.25, { unit: 'units' }),
        num('balance.repair.reference', 'Repair a fixture’s work time is measured at', 0.5, 10, 0.5, {
          help: "A fixture's work time is how long it takes someone with this Repair (plus bonus). Higher Repair is faster.",
        }),
        num('balance.repair.specialtyBonus', 'Bonus Repair on your own trade', 0, 5, 0.25),
        num('balance.repair.otherBonus', 'Bonus Repair on other fixtures', 0, 5, 0.25),
        num('balance.interactRangeTiles', 'Reach (scrap / unlock)', 0.5, 3, 0.05, { unit: 'tiles', help: 'How close you must stand, centre to centre.' }),
        num('balance.vanReachTiles', 'Van drop-off reach', 0, 3, 0.1, { unit: 'tiles', help: 'Extra tiles around the van that count as "at the van".' }),
      ],
    },
    ...Object.values(ABILITIES).map(
      (a): GroupDraft => ({
        id: `crew.ability.${a.id}`,
        title: a.name,
        titlePath: `abilities.${a.id}.name`,
        help: 'An ability (Q / the HIDE button).',
        fields: [
          text(`abilities.${a.id}.name`, 'Name', 32),
          text(`abilities.${a.id}.description`, 'Description', 140),
          num(`abilities.${a.id}.duration`, 'Lasts', 0.5, 60, 0.5, { unit: 's' }),
          num(`abilities.${a.id}.cooldown`, 'Cooldown', 0, 300, 1, { unit: 's', help: 'Counted from when it starts.' }),
        ],
      }),
    ),
  ],
);

const gravy = section('gravy', 'Mr. Gravy', 'The boss: how fast he is, how far he sees, how quickly he catches you and how he reacts to students.', [
  {
    id: 'gravy.stats',
    title: 'Stats',
    fields: [
      num('npcs.mr_gravy.speed', 'Speed', 0.5, 8, 0.25, {
        preview: (v) => {
          const chase = speedOf(v, v.npcs.mr_gravy.speed);
          return `chases ${fmt(chase)} tiles/s · patrols ${fmt(chase * v.balance.boss.patrolFactor)} · sprints ${fmt(chase * v.balance.boss.sprintFactor)}`;
        },
      }),
      num('npcs.mr_gravy.awareness', 'Awareness', 0.5, 8, 0.25, {
        help: 'Widens and lengthens his vision cone and makes him catch you faster.',
        preview: (v) => {
          const k = 2 / v.npcs.mr_gravy.awareness;
          return `sees ${fmt(gravyRange(v))} tiles, ${fmt(gravyAngle(v), 0)}° cone · catches you in ${fmt(v.balance.boss.noticeSecondsNear * k)}–${fmt(v.balance.boss.noticeSecondsFar * k)} s`;
        },
      }),
      text('npcs.mr_gravy.name', 'Name', 24),
    ],
  },
  {
    id: 'gravy.vision',
    title: 'Vision cone',
    fields: [
      num('balance.boss.visionRangeBaseTiles', 'Reach at Awareness 0', 0, 15, 0.25, { unit: 'tiles', preview: (v) => `reach now ${fmt(gravyRange(v))} tiles` }),
      num('balance.boss.visionRangeTilesPerAwareness', 'Extra reach per Awareness point', 0, 5, 0.05, { unit: 'tiles' }),
      num('balance.boss.visionHalfAngleBaseDeg', 'Half-width at Awareness 0', 5, 90, 1, { unit: '°', preview: (v) => `cone now ${fmt(gravyAngle(v), 0)}° wide` }),
      num('balance.boss.visionHalfAngleDegPerAwareness', 'Extra half-width per Awareness point', 0, 30, 0.5, { unit: '°' }),
    ],
  },
  {
    id: 'gravy.catching',
    title: 'Catching you',
    help: 'He only cares while you carry scrap or are scrapping.',
    fields: [
      num('balance.boss.noticeSecondsNear', 'Seconds to catch you, up close', 0.1, 10, 0.1, { unit: 's', help: 'At Awareness 2; more awareness is faster.' }),
      num('balance.boss.noticeSecondsFar', 'Seconds to catch you, at the edge of his cone', 0.1, 15, 0.1, { unit: 's' }),
      num('balance.boss.chaseAt', 'Starts chasing at suspicion', 0, 1, 0.05, { percent: true, help: 'Before this he just stares.' }),
      num('balance.boss.suspicionDecay', 'Suspicion lost per second out of sight', 0, 5, 0.05, { percent: true }),
      num('balance.boss.catchRangeTiles', 'Catch distance', 0.2, 3, 0.05, { unit: 'tiles' }),
      num('balance.boss.searchSeconds', 'Searches where he lost you for', 0, 20, 0.5, { unit: 's' }),
    ],
  },
  {
    id: 'gravy.patrol',
    title: 'Patrol',
    fields: [
      num('balance.boss.patrolFactor', 'Patrol speed (share of chase speed)', 0.1, 1.5, 0.02, { percent: true }),
      range('balance.boss.waypointPause', 'Looks around at each route stop for', 0, 20, 0.1, 's'),
      num('balance.shift.bossSpeedUpAt', 'Finishes his coffee at (share of the shift)', 0, 1, 0.05, { percent: true, help: 'From then on he is faster.' }),
      num('balance.shift.bossSpeedUpMultiplier', 'Speed after coffee', 0.5, 3, 0.05, { unit: '×' }),
    ],
  },
  {
    id: 'gravy.reports',
    title: 'When a student yells',
    fields: [
      num('balance.boss.sprintFactor', 'Sprint speed (× chase speed)', 0.5, 3, 0.05, { unit: '×' }),
      num('balance.boss.respondSearchSeconds', 'Searches the reported spot for', 0, 20, 0.5, { unit: 's' }),
    ],
  },
  {
    id: 'gravy.lines',
    title: 'What he says',
    fields: [lines('lines.gravy.caught', 'Catching you (by warning number; the last repeats)'), lines('lines.gravy.heard', 'Hearing a student yell')],
  },
]);

const students = section('students', 'Students', 'They yell for Mr. Gravy when they see you with scrap, follow you, and go on high alert after a report.', [
  {
    id: 'students.stats',
    title: 'Stats',
    fields: [
      num('npcs.student.speed', 'Speed', 0.25, 8, 0.25, {
        preview: (v) => {
          const walk = speedOf(v, v.npcs.student.speed) * v.balance.students.walkFactor;
          return `stroll ${fmt(walk)} tiles/s · follow ${fmt(walk * v.balance.students.followFactor)} tiles/s`;
        },
      }),
    ],
  },
  {
    id: 'students.vision',
    title: 'Vision',
    help: 'Seeing you with scrap (or scrapping) inside this cone gets you yelled at instantly.',
    fields: [
      num('balance.students.visionRangeTiles', 'Reach', 0.5, 20, 0.25, { unit: 'tiles' }),
      num('balance.students.visionHalfAngleDeg', 'Half-width', 5, 90, 1, { unit: '°', preview: (v) => `${fmt(v.balance.students.visionHalfAngleDeg * 2, 0)}° cone` }),
    ],
  },
  {
    id: 'students.wander',
    title: 'Hanging out',
    fields: [
      num('balance.students.walkFactor', 'Strolling speed (share of their Speed pace)', 0.1, 2, 0.05, { percent: true }),
      num('balance.students.wanderRadiusTiles', 'Stroll this far from where they start', 1, 40, 1, { unit: 'tiles' }),
      { path: 'balance.students.hangouts', label: 'Rooms they stroll around', kind: { type: 'set', options: ROOM_OPTIONS } },
      range('balance.students.pauseSeconds', 'Stand and look around between strolls', 0, 30, 0.5, 's'),
    ],
  },
  {
    id: 'students.yell',
    title: 'Yelling',
    fields: [
      num('balance.students.yellSeconds', 'A yell lasts', 0.2, 10, 0.1, { unit: 's' }),
      num('balance.students.yellHearingTiles', 'Mr. Gravy hears a yell from', 0, 60, 0.5, { unit: 'tiles', help: 'Straight line; walls do not muffle it. Only a heard yell is a report.' }),
      num('balance.students.reyellSeconds', 'Following students yell again every', 0.5, 30, 0.5, { unit: 's' }),
    ],
  },
  {
    id: 'students.follow',
    title: 'Following you',
    fields: [
      num('balance.students.followFactor', 'Follow speed (share of strolling speed)', 0, 2, 0.05, { percent: true }),
      num('balance.students.followKeepTiles', 'Stop this close to you', 0.5, 10, 0.25, { unit: 'tiles' }),
      num('balance.students.followGiveUpSeconds', 'Give up after not seeing you for', 0, 60, 0.5, { unit: 's' }),
      num('balance.students.ignoreSeconds', 'Then leave you alone for', 0, 120, 1, { unit: 's', help: 'Also after Mr. Gravy catches you.' }),
    ],
  },
  {
    id: 'students.notice',
    title: 'Noticing you empty-handed (high alert only)',
    fields: [
      num('balance.students.noticeSecondsNear', 'Seconds of staring before they yell, up close', 0.1, 20, 0.1, { unit: 's' }),
      num('balance.students.noticeSecondsFar', '…at the edge of their cone', 0.1, 30, 0.1, { unit: 's' }),
      num('balance.students.suspicionDecay', 'Suspicion lost per second out of sight', 0, 5, 0.05, { percent: true }),
    ],
  },
  {
    id: 'students.alert',
    title: 'High alert',
    help: 'Starts when Mr. Gravy hears a yell about you holding scrap. Another report restarts it.',
    fields: [
      num('balance.students.highAlertSeconds', 'Lasts', 0, 600, 5, { unit: 's' }),
      num('balance.students.highAlertRangeFactor', 'Vision reach', 0.5, 3, 0.05, { unit: '×', preview: (v) => `${fmt(v.balance.students.visionRangeTiles * v.balance.students.highAlertRangeFactor)} tiles` }),
      num('balance.students.highAlertExtraHalfAngleDeg', 'Extra cone half-width', 0, 60, 1, { unit: '°' }),
      num('balance.students.highAlertWalkFactor', 'Stroll speed', 0.5, 3, 0.05, { unit: '×' }),
      num('balance.students.highAlertPauseFactor', 'Pauses between strolls', 0.1, 3, 0.05, { unit: '×' }),
      num('balance.students.highAlertLookFactor', 'Looking around', 0.1, 5, 0.1, { unit: '×' }),
      num('balance.students.chatterGapSeconds', 'Word spreads: next student talks after', 0, 5, 0.1, { unit: 's', advanced: true }),
      num('balance.students.chatterJitterSeconds', '…plus up to this much random delay', 0, 5, 0.1, { unit: 's', advanced: true }),
      range('balance.students.chatterEverySeconds', 'Chatter again every', 1, 120, 1, 's', { advanced: true }),
    ],
  },
  {
    id: 'students.danger',
    title: 'Danger edge and toasts',
    help: 'How much each student lights up the red screen edge (Mr. Gravy chasing is 0.6 or more).',
    fields: [
      num('balance.students.danger.notice', 'Staring at you', 0, 1, 0.05, { advanced: true }),
      num('balance.students.danger.yelling', 'Yelling', 0, 1, 0.05, { advanced: true }),
      num('balance.students.danger.following', 'Following', 0, 1, 0.05, { advanced: true }),
      num('balance.students.toastCooldownSeconds', 'Same warning toast at most every', 0, 60, 1, { unit: 's', advanced: true }),
    ],
  },
  {
    id: 'students.lines',
    title: 'What they say',
    fields: [
      lines('lines.students.redHanded', 'Seeing you with scrap'),
      lines('lines.students.suspect', 'Spotting you empty-handed on high alert'),
      lines('lines.students.again', 'Yelling again while following'),
      lines('lines.students.busted', 'Mr. Gravy catches you'),
      lines('lines.students.fooled', 'Fooled by your disguise'),
      lines('lines.students.chatter', 'Talking on high alert'),
    ],
  },
]);

const coworker = section('coworker', 'Sleepy Coworker', 'Naps under desks. Finish scrapping one and he may crawl out and pay you to keep quiet.', [
  {
    id: 'coworker.main',
    title: 'Hush money',
    fields: [
      num('balance.sleepyCoworker.chance', 'Chance he is under the desk', 0, 1, 0.01, { percent: true }),
      num('balance.sleepyCoworker.maxPerShift', 'At most this many times a shift', 0, 20, 1, { int: true }),
      num('balance.sleepyCoworker.hushMoney', 'He pays', 0, 1000, 5, { unit: '$' }),
      { path: 'balance.sleepyCoworker.napsUnder', label: 'Naps under', kind: { type: 'set', options: fixtureOptions() } },
    ],
  },
  {
    id: 'coworker.timing',
    title: 'Timing',
    fields: [
      num('balance.sleepyCoworker.napSeconds', 'Snoozes before waking', 0, 10, 0.1, { unit: 's' }),
      num('balance.sleepyCoworker.wakeSeconds', 'Jolts awake for', 0, 5, 0.1, { unit: 's' }),
      range('balance.sleepyCoworker.lineSeconds', 'His two lines stay up for', 0.5, 15, 0.1, 's'),
      num('balance.sleepyCoworker.shuffleTilesPerSecond', 'Shuffles off at', 0.1, 5, 0.1, { unit: 'tiles/s' }),
      num('balance.sleepyCoworker.shuffleTiles', 'Tries to get this far away', 0, 20, 0.5, { unit: 'tiles' }),
      num('balance.sleepyCoworker.shuffleSeconds', 'Fades out after shuffling for', 0, 20, 0.5, { unit: 's' }),
      num('balance.sleepyCoworker.fadeSeconds', 'Fade takes', 0, 5, 0.1, { unit: 's' }),
    ],
  },
  {
    id: 'coworker.lines',
    title: 'What he says',
    fields: [
      text('lines.coworker.wake', 'Waking up', 160),
      text('lines.coworker.bribe', 'Paying you ({money} becomes the amount)', 160),
      text('npcs.sleepy_coworker.name', 'Name', 24),
    ],
  },
]);

const loot = section('loot', 'Scrap & Loot', 'What scrap sells for, and what each fixture gives, how long it takes and when it can be stripped again.', [
  {
    id: 'loot.materials',
    title: 'Scrap prices',
    help: 'Dollars per unit of scrap sold at the van.',
    fields: MATERIAL_ORDER.flatMap((id) => [
      num(`materials.${id}.pricePerUnit`, `${MATERIALS[id].name} price`, 0, 1000, 0.5, { unit: '$/unit' }),
      text(`materials.${id}.name`, `${MATERIALS[id].name} name`, 24, { advanced: true }),
    ]),
  },
  ...Object.values(FIXTURES).map(
    (f): GroupDraft => ({
      id: `loot.${f.id}`,
      title: f.name,
      titlePath: `fixtures.${f.id}.name`,
      fields: [
        text(`fixtures.${f.id}.name`, 'Name', 32),
        {
          path: `fixtures.${f.id}.material`,
          label: 'Gives',
          kind: { type: 'choice', options: materialOptions() },
          preview: (v) => {
            const fx = v.fixtures[f.id];
            const price = v.materials[fx.material].pricePerUnit;
            const [lo, hi] = fx.range ?? [fx.scrap, fx.scrap];
            return lo === hi ? `worth ${money(lo * price)} a strip` : `worth ${money(lo * price)}–${money(hi * price)} a strip`;
          },
        },
        num(`fixtures.${f.id}.scrap`, 'Scrap per strip (average)', 0, 20, 0.05, { unit: 'units', help: 'Used when there is no random range.' }),
        { path: `fixtures.${f.id}.range`, label: 'Random yield range', help: 'Low and high, rolled each strip. Turn off for a fixed yield.', kind: { type: 'optionalRange', min: 0, max: 20, step: 0.05, unit: 'units' } },
        num(`fixtures.${f.id}.workSeconds`, 'Work time', 0.2, 60, 0.1, {
          unit: 's',
          preview: (v) => crewLine(v, (id) => `${fmt(stripSeconds(v, id, f.id))} s`),
        }),
        range(`fixtures.${f.id}.recharge`, 'Can be stripped again after', 0, 900, 1, 's'),
        { path: `fixtures.${f.id}.type`, label: 'Trade', kind: { type: 'choice', options: TRADE_OPTIONS } },
        { path: `fixtures.${f.id}.tier`, label: 'Value tier (glow colour)', kind: { type: 'choice', options: TIER_OPTIONS }, advanced: true },
      ],
    }),
  ),
]);

const shift = section('shift', 'Shift & Rules', 'How long a shift lasts, warnings, doors, and the phone camera.', [
  {
    id: 'shift.main',
    title: 'The shift',
    fields: [
      num('balance.shift.lengthSeconds', 'Shift length (real time)', 30, 3600, 10, {
        unit: 's',
        preview: (v) => `${Math.floor(v.balance.shift.lengthSeconds / 60)} min ${v.balance.shift.lengthSeconds % 60} s`,
      }),
      num('balance.shift.startHour', 'Clock starts at', 0, 23, 1, { int: true, unit: 'h' }),
      num('balance.shift.endHour', 'Clock ends at', 1, 24, 1, { int: true, unit: 'h' }),
      num('balance.shift.lastCallAt', '"Almost over" reminder at (share of the shift)', 0, 1, 0.01, { percent: true }),
      num('balance.warningsUntilFired', 'Warnings until fired', 1, 10, 1, { int: true }),
      num('balance.graceSeconds', 'Mr. Gravy ignores you after a warning for', 0, 30, 0.5, { unit: 's' }),
      num('balance.doors.unlockSeconds', 'Unlocking a door takes', 0, 60, 0.5, { unit: 's' }),
    ],
  },
  {
    id: 'shift.camera',
    title: 'Phone camera',
    help: 'Phones zoom out so students who can see Dalton are on screen too.',
    fields: [
      num('balance.camera.seeBeyondTiles', 'Show this far past the farthest student sight', 0, 10, 0.5, { unit: 'tiles', advanced: true }),
      num('balance.camera.minTileCssPx', 'Smallest tile on screen', 8, 80, 1, { unit: 'px', advanced: true }),
      num('balance.camera.maxTileCssPx', 'Largest tile on screen', 8, 120, 1, { unit: 'px', advanced: true }),
    ],
  },
]);

export const SECTIONS: Section[] = [crew, gravy, students, coworker, loot, shift];

export const FIELDS: Field[] = SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.fields));

export const FIELD_BY_PATH = new Map<string, Field>(FIELDS.map((f) => [f.path, f]));

// ---- checking values ---------------------------------------------------------------------

export type CheckResult = { ok: true; value: string | number | null | (string | null)[] | number[]; note?: string } | { ok: false; reason: string };

function snap(n: number, kind: { min: number; max: number; step: number; int?: boolean }): number {
  const clamped = Math.min(kind.max, Math.max(kind.min, n));
  const step = kind.int ? Math.max(1, kind.step) : kind.step;
  // Round to the step (from the minimum), then tidy float noise.
  const stepped = kind.min + Math.round((clamped - kind.min) / step) * step;
  return Number(Math.min(kind.max, Math.max(kind.min, stepped)).toFixed(6));
}

/** Whether `raw` can go into `field`, and the tidied value (numbers clamped and rounded to the step). */
export function checkValue(field: Field, raw: unknown): CheckResult {
  const k = field.kind;
  switch (k.type) {
    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return { ok: false, reason: 'not a number' };
      const value = snap(raw, k);
      return { ok: true, value, note: value !== raw && Math.abs(value - raw) > 1e-9 ? `${raw} is outside ${k.min}–${k.max} (or between steps), using ${value}` : undefined };
    }
    case 'range':
    case 'optionalRange': {
      if (raw === null && k.type === 'optionalRange') return { ok: true, value: null };
      if (!Array.isArray(raw) || raw.length !== 2 || !raw.every((n) => typeof n === 'number' && Number.isFinite(n))) return { ok: false, reason: 'needs two numbers' };
      let [a, b] = (raw as number[]).map((n) => snap(n, k));
      if (a > b) [a, b] = [b, a];
      return { ok: true, value: [a, b] };
    }
    case 'text': {
      if (typeof raw !== 'string') return { ok: false, reason: 'not text' };
      const value = raw.replace(/[\r\n]+/g, ' ').slice(0, k.maxLength);
      if (!value.trim()) return { ok: false, reason: 'empty' };
      return { ok: true, value };
    }
    case 'lines': {
      if (!Array.isArray(raw)) return { ok: false, reason: 'not a list of lines' };
      const value = raw
        .filter((l): l is string => typeof l === 'string')
        .map((l) => l.replace(/[\r\n]+/g, ' ').trim().slice(0, k.maxLength))
        .filter(Boolean)
        .slice(0, k.maxItems);
      if (!value.length) return { ok: false, reason: 'needs at least one line' };
      return { ok: true, value };
    }
    case 'choice': {
      const hit = k.options.find((o) => o.value === raw);
      return hit ? { ok: true, value: hit.value } : { ok: false, reason: `"${String(raw)}" is not one of the choices` };
    }
    case 'set': {
      if (!Array.isArray(raw)) return { ok: false, reason: 'not a list' };
      const allowed = new Set(k.options.map((o) => o.value));
      const value = [...new Set(raw.filter((v): v is string => typeof v === 'string' && allowed.has(v)))];
      if (!value.length) return { ok: false, reason: 'pick at least one' };
      return { ok: true, value };
    }
  }
}

/** A value as people read it ("1.35 ×", "45%", "2–4 s", "None"). */
export function formatValue(field: Field, value: unknown): string {
  const k = field.kind;
  if (value === undefined) return '—';
  switch (k.type) {
    case 'number':
      if (typeof value !== 'number') return String(value);
      if (k.percent) return `${fmt(value * 100, 0)}%`;
      return k.unit === '$' ? `$${fmt(value, 2)}` : `${fmt(value, 2)}${k.unit ? ` ${k.unit}` : ''}`;
    case 'range':
    case 'optionalRange':
      if (value === null) return 'off';
      if (!Array.isArray(value)) return String(value);
      return `${fmt(value[0], 2)}–${fmt(value[1], 2)}${k.unit ? ` ${k.unit}` : ''}`;
    case 'choice':
      return k.options.find((o) => o.value === value)?.label ?? String(value);
    case 'set':
      return Array.isArray(value) ? value.map((v) => k.options.find((o) => o.value === v)?.label ?? String(v)).join(', ') : String(value);
    case 'lines':
      return Array.isArray(value) ? `${value.length} line${value.length === 1 ? '' : 's'}` : String(value);
    case 'text':
      return `"${String(value)}"`;
  }
}

/** "Mr. Gravy › Stats › Speed: 2 → 1.5" */
export function describeChange(field: Field, from: unknown, to: unknown): string {
  return `${field.where} › ${field.label}: ${formatValue(field, from)} → ${formatValue(field, to)}`;
}
