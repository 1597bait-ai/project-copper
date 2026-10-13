// Copper Studio's look. It lives here, in the game's script, and is added to the page when the
// Studio first opens: the published page is rebuilt from its title, #copper-style, #copper-tuning
// and #copper-game alone, so a stylesheet anywhere else would be lost on the next save.

const STYLE_ID = 'copper-studio-css';

const chevron = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%23f6f1e5' stroke-width='2'/%3E%3C/svg%3E")`;

const CSS = `
.cs, .cs-back {
  --bg: #14161c; --panel: #1b1f28; --panel2: #252a36; --field: #0f1116; --line: #2c3240; --line2: #3c4456;
  --text: #f6f1e5; --muted: #b9b1a2; --dim: #8d877b; --copper: #e8914a; --copper-hi: #f4a861; --ink: #1a1208;
  --good: #8be08b; --bad: #ff8576; --warn: #ffd27a;
  --body: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  /* Headings too: the game's pixel font draws its C almost closed, so at these sizes
     "COPPER" read "OOPPER" and "Crew" "Orew". */
  --head: var(--body);
}
.cs {
  position: fixed; inset: 0; z-index: 20; box-sizing: border-box;
  display: grid; grid-template-columns: 248px minmax(0, 1fr); grid-template-rows: auto auto minmax(0, 1fr);
  grid-template-areas: "head head" "notes notes" "nav main";
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
  background: var(--bg); color: var(--text); font: 15px/1.45 var(--body);
  -webkit-user-select: text; user-select: text; -webkit-touch-callout: default; touch-action: manipulation;
  -webkit-text-size-adjust: 100%; text-size-adjust: 100%;
}
.cs *, .cs *::before, .cs *::after { box-sizing: border-box; }
.cs [hidden], .cs[hidden], .cs-back[hidden] { display: none !important; }
:where(.cs) :where(h1, h2, h3, p, ul) { margin: 0; }
:where(.cs) :where(button, input, select, textarea) { font-family: var(--body); }
.cs :focus-visible { outline: 2px solid var(--copper-hi); outline-offset: 2px; }

/* ---- header */
.cs-head { grid-area: head; display: flex; align-items: center; flex-wrap: wrap; gap: 10px 16px; padding: 10px 16px; background: #0f1116; border-bottom: 2px solid var(--copper); }
.cs-brand { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 10px; flex: 1 1 auto; min-width: 0; }
.cs-logo { font: 800 21px/1 var(--head); letter-spacing: .06em; color: var(--copper); white-space: nowrap; text-shadow: 2px 2px 0 #000; margin-right: 4px; }
.cs-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line2); background: var(--panel); color: var(--muted); font-size: 13px; line-height: 1.3; white-space: nowrap; }
.cs-chip b { color: var(--text); font-weight: 700; }
.cs-chip.is-dirty { border-color: var(--copper); background: rgba(232,145,74,.14); color: var(--copper-hi); }
.cs-chip.is-dirty b { color: var(--copper-hi); }
.cs-narrow { display: none; }
.cs-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.cs-play { display: inline-flex; min-width: 0; }
.cs-play select { border-radius: 8px 0 0 8px; border-right: 0; min-width: 0; }
.cs-play .cs-btn { border-radius: 0 8px 8px 0; }
.cs-saveset { display: flex; align-items: center; gap: 8px; }

/* ---- buttons and inputs */
.cs-btn { appearance: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 38px; padding: 0 14px;
  border: 1px solid var(--line2); border-radius: 8px; background: var(--panel2); color: var(--text); font: 600 14px/1.2 var(--body);
  white-space: nowrap; cursor: pointer; touch-action: manipulation; -webkit-user-select: none; user-select: none; }
.cs-btn:hover:not(:disabled) { background: #2e3443; border-color: #525b70; }
.cs-btn:active:not(:disabled) { transform: translateY(1px); }
.cs-btn:disabled { opacity: .45; cursor: not-allowed; }
.cs-btn.is-primary { background: var(--copper); border-color: var(--copper); color: var(--ink); }
.cs-btn.is-primary:hover:not(:disabled) { background: var(--copper-hi); border-color: var(--copper-hi); }
.cs-btn.is-danger { background: #3a1916; border-color: #7a2f27; color: #ffc2b8; }
.cs-btn.is-danger:hover:not(:disabled) { background: #4a1f1b; }
.cs-btn.is-icon { width: 40px; padding: 0; font-size: 20px; letter-spacing: 1px; }
.cs-link { appearance: none; border: 0; background: none; padding: 2px 2px; color: var(--copper-hi); font: 600 13px/1.3 var(--body); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.cs-link:hover { color: #ffd0a3; }
.cs select, .cs input[type=text], .cs input[type=search], .cs textarea {
  min-height: 38px; padding: 6px 10px; border: 1px solid var(--line2); border-radius: 8px; background-color: var(--field); color: var(--text);
  font: 15px/1.35 var(--body); -webkit-user-select: text; user-select: text; }
.cs select { appearance: none; padding-right: 30px; background-image: ${chevron}; background-repeat: no-repeat; background-position: right 10px center; cursor: pointer; }
.cs input::placeholder, .cs textarea::placeholder { color: var(--dim); }
.cs input:disabled { opacity: .45; }
.cs input[type=text]:focus, .cs input[type=search]:focus, .cs textarea:focus, .cs select:focus { border-color: var(--copper); outline: none; box-shadow: 0 0 0 2px rgba(232,145,74,.35); }

/* ---- the More menu */
.cs-menuwrap { position: relative; }
.cs-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 6; min-width: 290px; max-width: calc(100vw - 24px); display: flex; flex-direction: column;
  padding: 6px; border: 1px solid var(--line2); border-radius: 10px; background: var(--panel); box-shadow: 0 14px 36px rgba(0,0,0,.55); }
.cs-menu button { appearance: none; display: block; width: 100%; min-height: 42px; padding: 9px 12px; border: 0; border-radius: 6px; background: none; color: var(--text); font: 15px/1.3 var(--body); text-align: left; cursor: pointer; }
.cs-menu button:hover, .cs-menu button:focus-visible { background: var(--panel2); outline: none; }
.cs-menu button small { display: block; color: var(--dim); font-size: 12.5px; }
.cs-menu .is-danger { color: #ffb4a8; }
.cs-menu hr { border: 0; border-top: 1px solid var(--line); margin: 4px 2px; }

/* ---- notices under the header */
.cs-notes { grid-area: notes; display: flex; flex-direction: column; }
.cs-note { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; padding: 8px 16px; border-bottom: 1px solid var(--line); background: #161b26; color: #d6deef; font-size: 14px; }
.cs-note > span { flex: 1 1 260px; }
.cs-note.is-good { background: #132016; color: #c8f2c1; }
.cs-note.is-warn { background: #251d0f; color: #ffe2a3; }
.cs-note.is-bad { background: #2a1513; color: #ffc9c0; }
.cs-note .cs-btn { min-height: 32px; padding: 0 10px; font-size: 13px; }

/* ---- sections list */
.cs-nav { grid-area: nav; display: flex; flex-direction: column; gap: 12px; min-height: 0; padding: 14px 12px 24px; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y;
  border-right: 1px solid var(--line); background: #111319; }
.cs-search { width: 100%; }
.cs-tabs { display: flex; flex-direction: column; gap: 2px; }
.cs-tab { appearance: none; display: flex; align-items: center; gap: 8px; width: 100%; min-height: 40px; padding: 8px 12px; border: 0; border-radius: 8px; background: none;
  color: var(--muted); font: 600 15px/1.2 var(--body); text-align: left; cursor: pointer; touch-action: manipulation; -webkit-user-select: none; user-select: none; }
.cs-tab:hover { background: var(--panel); color: var(--text); }
.cs-tab[aria-selected=true] { background: rgba(232,145,74,.15); color: var(--text); box-shadow: inset 3px 0 0 var(--copper); }
.cs-count { margin-left: auto; min-width: 22px; padding: 0 7px; border-radius: 999px; background: var(--copper); color: var(--ink); font: 700 12px/20px var(--body); text-align: center; }
.cs-tab-gap { height: 1px; margin: 6px 6px; background: var(--line); }

/* ---- the page */
.cs-main { grid-area: main; min-height: 0; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; -webkit-overflow-scrolling: touch; padding: 26px 28px 120px; }
.cs-page { max-width: 900px; margin: 0 auto; }
.cs-h1 { font: 800 30px/1.15 var(--head); letter-spacing: .005em; color: var(--text); margin-bottom: 6px; }
.cs-blurb { color: var(--muted); max-width: 72ch; margin-bottom: 22px; }
.cs-card { margin: 0 0 18px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); overflow: hidden; }
.cs-card-head { padding: 14px 18px 12px; border-bottom: 1px solid var(--line); background: #1f2430; }
.cs-crumb { margin-bottom: 2px; color: var(--dim); font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.cs-h2 { font: 800 18px/1.25 var(--head); letter-spacing: .01em; color: var(--copper-hi); }
.cs-card-help { margin-top: 4px; color: var(--muted); font-size: 14px; }
.cs-more { width: 100%; min-height: 46px; justify-content: space-between; border: 0; border-top: 1px solid var(--line); border-radius: 0; background: #191d26; color: var(--muted); padding: 0 18px; }
.cs-more:hover:not(:disabled) { background: #20252f; border-color: var(--line); color: var(--text); }
.cs-more .cs-dot { margin: 0 0 0 8px; }
.cs-card-head + .cs-more { border-top: 0; }
.cs-empty { padding: 28px 8px; color: var(--muted); text-align: center; }

/* ---- one setting */
.cs-field { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: 6px 22px; padding: 14px 18px; border-top: 1px solid var(--line); }
.cs-fields > .cs-field:first-child { border-top: 0; }
.cs-field.is-unsaved { background: rgba(232,145,74,.07); box-shadow: inset 3px 0 0 var(--copper); }
.cs-label { display: block; font-weight: 650; }
.cs-help { margin-top: 2px; color: var(--muted); font-size: 13.5px; }
.cs-control { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; min-width: 0; }
.cs-numbox { display: inline-flex; align-items: center; gap: 6px; }
.cs .cs-num { width: 90px; text-align: right; font-variant-numeric: tabular-nums; }
.cs-unit { color: var(--muted); font-size: 13px; white-space: nowrap; }
.cs-track { flex: 1 1 150px; min-width: 110px; display: flex; align-items: center; min-height: 38px; touch-action: pan-y; cursor: pointer; }
.cs-slider { width: 100%; height: 30px; margin: 0; accent-color: var(--copper); cursor: pointer; touch-action: pan-y; }
/* Touch screens: the track follows sideways drags (fieldView.ts), so a swipe that scrolls the page never moves a slider. */
@media (pointer: coarse) { .cs-slider { pointer-events: none; } .cs-track { min-height: 44px; } }
.cs-range { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.cs-range .cs-num { width: 82px; }
.cs-to { color: var(--muted); font-size: 13px; }
.cs-switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; color: var(--muted); min-height: 38px; }
.cs-switch input { appearance: none; position: relative; width: 42px; height: 24px; margin: 0; border-radius: 999px; background: #3a4152; cursor: pointer; transition: background .15s; }
.cs-switch input::after { content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: var(--text); transition: transform .15s; }
.cs-switch input:checked { background: var(--copper); }
.cs-switch input:checked::after { transform: translateX(18px); }
.cs .cs-text { width: 100%; }
.cs .cs-lines { width: 100%; min-height: 92px; resize: vertical; font-size: 14px; line-height: 1.45; }
.cs-select { max-width: 100%; }
.cs-set { display: flex; flex-wrap: wrap; gap: 6px; }
.cs-check { display: inline-flex; align-items: center; gap: 8px; min-height: 38px; padding: 5px 12px 5px 9px; border: 1px solid var(--line2); border-radius: 999px; background: var(--field); font-size: 14px; cursor: pointer; -webkit-user-select: none; user-select: none; }
.cs-check:has(input:checked) { border-color: var(--copper); background: rgba(232,145,74,.13); }
.cs-check input { width: 18px; height: 18px; margin: 0; accent-color: var(--copper); }
.cs-preview { margin-top: 7px; color: #ffcf9e; font-size: 13.5px; }
.cs-preview::before { content: "▸ "; color: var(--copper); }
.cs-msg { margin-top: 6px; font-size: 13px; }
.cs-msg:empty { display: none; }
.cs-msg.is-note { color: var(--warn); }
.cs-msg.is-error { color: var(--bad); }
.cs-status { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 14px; margin-top: 6px; color: var(--muted); font-size: 13px; }
.cs-status:empty { display: none; }
.cs-status > span { display: inline-flex; align-items: center; gap: 4px; }
.cs-dot { display: inline-block; flex: none; width: 8px; height: 8px; margin-right: 2px; border-radius: 50%; background: var(--copper); }

/* ---- the Map tab: the map editor (the game canvas) shows through */
.cs-maphost { grid-area: main; display: none; position: relative; pointer-events: none; }
.cs-maphost p { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); font: 18px var(--head); }
.cs.is-map { background: transparent; pointer-events: none; }
.cs.is-map > * { pointer-events: auto; }
.cs.is-map > .cs-main { display: none; }
.cs.is-map > .cs-maphost { display: block; pointer-events: none; }
.cs-maphost.is-waiting { background: var(--bg); }

/* ---- history */
.cs-hist { padding: 14px 18px; border-top: 1px solid var(--line); }
.cs-hist:first-child { border-top: 0; }
.cs-hist-top { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; }
.cs-hist-ver { font: 700 20px/1.2 var(--head); color: var(--copper-hi); }
.cs-hist-date { color: var(--muted); font-size: 13px; }
.cs-hist-top .cs-btn { margin-left: auto; }
.cs-badge { padding: 2px 9px; border-radius: 999px; background: #1e3a22; color: #b9f1b1; font-size: 12px; font-weight: 700; }
.cs-hist-note { margin-top: 6px; }
.cs-hist-note.is-empty { color: var(--dim); font-style: italic; }
.cs-changes { margin: 8px 0 0; padding-left: 20px; color: var(--muted); font-size: 13.5px; }
.cs-changes li { margin: 2px 0; overflow-wrap: anywhere; }

/* ---- dialogs and toasts */
.cs-layer { position: fixed; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(6,7,10,.74); pointer-events: auto; }
.cs-dialog { display: flex; flex-direction: column; width: min(660px, 100%); max-height: 100%; border: 1px solid var(--line2); border-top: 3px solid var(--copper); border-radius: 12px; background: var(--panel); box-shadow: 0 24px 64px rgba(0,0,0,.6); }
.cs-dialog-head { padding: 16px 20px 6px; }
.cs-dialog-head h2 { font: 800 20px/1.25 var(--head); letter-spacing: .005em; color: var(--text); }
.cs-dialog-body { display: flex; flex-direction: column; gap: 12px; min-height: 0; padding: 8px 20px 14px; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; }
.cs-dialog-body > p { color: var(--muted); }
.cs-dialog-foot { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; padding: 12px 20px 16px; border-top: 1px solid var(--line); }
.cs-flabel { display: block; margin-bottom: 6px; font-weight: 650; }
.cs .cs-note-input { width: 100%; min-height: 70px; resize: vertical; }
.cs .cs-code { width: 100%; min-height: 240px; resize: vertical; font: 12.5px/1.35 ui-monospace, Menlo, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; overflow: auto; }
.cs input[type=file] { max-width: 100%; color: var(--muted); font: 14px var(--body); }
.cs input[type=file]::file-selector-button { margin-right: 10px; min-height: 34px; padding: 0 12px; border: 1px solid var(--line2); border-radius: 8px; background: var(--panel2); color: var(--text); font: 600 13px var(--body); cursor: pointer; }
.cs-box { padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line2); background: var(--field); font-size: 14px; }
.cs-box.is-bad { border-color: #7a2f27; background: #2a1513; color: #ffc9c0; }
.cs-box.is-warn { border-color: #6b5420; background: #251d0f; color: #ffe2a3; }
.cs-box.is-good { border-color: #2f6b34; background: #132016; color: #c8f2c1; }
.cs-box ul { margin: 6px 0 0; padding-left: 20px; }
.cs-toasts { position: fixed; left: 50%; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); z-index: 30; display: flex; flex-direction: column; align-items: center; gap: 8px;
  width: min(560px, calc(100% - 32px)); transform: translateX(-50%); pointer-events: none; }
.cs-toast { max-width: 100%; padding: 10px 14px; border: 1px solid var(--line2); border-left: 4px solid var(--copper); border-radius: 8px; background: #0d0f14; color: var(--text);
  box-shadow: 0 10px 28px rgba(0,0,0,.55); font-size: 14px; animation: cs-in .18s ease-out; }
.cs-toast.is-good { border-left-color: var(--good); }
.cs-toast.is-bad { border-left-color: var(--bad); }
@keyframes cs-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* ---- the floating way back during a play test */
.cs-back { position: fixed; z-index: 25; top: 8px; left: 50%; display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 14px;
  border: 2px solid var(--copper); border-radius: 10px; background: rgba(15,17,22,.92); color: var(--text); box-shadow: 2px 3px 0 rgba(0,0,0,.45);
  font: 800 16px/1 var(--head); letter-spacing: .05em; cursor: pointer; touch-action: manipulation; -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; }
.cs-back:hover { background: rgba(48,32,20,.95); }
.cs-back:focus-visible { outline: 2px solid var(--copper-hi); outline-offset: 2px; }
@media (pointer: coarse) { .cs-back { height: 44px; } }

/* ---- phones and narrow windows */
@media (max-width: 760px) {
  .cs { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto auto minmax(0, 1fr); grid-template-areas: "head" "notes" "nav" "main"; font-size: 16px; }
  .cs-head { gap: 8px; padding: 8px 12px; }
  .cs-brand { gap: 6px 8px; }
  .cs-logo { font-size: 19px; margin-right: 0; }
  .cs-chip { font-size: 12.5px; padding: 3px 8px; }
  .cs-wide { display: none; }
  .cs-narrow { display: inline; }
  /* One row on most phones; on the narrowest, Save and the menu wrap to a second one. */
  .cs-actions { width: 100%; flex-wrap: wrap; gap: 6px; }
  .cs-play { flex: 1 0 auto; }
  .cs-play select { flex: 1 1 auto; width: 0; min-width: 104px; padding-right: 28px; background-position: right 9px center; }
  .cs-saveset { flex: 1 0 auto; gap: 6px; }
  .cs-saveset .is-primary { flex: 1 1 auto; }
  .cs-head .cs-btn { padding: 0 11px; }
  .cs-head .cs-btn.is-icon { padding: 0; }
  .cs-note { padding: 8px 12px; }
  .cs-nav { gap: 0; padding: 0; overflow: visible; border-right: 0; border-bottom: 1px solid var(--line); }
  .cs-tabs { order: 1; flex-direction: row; gap: 4px; padding: 6px 8px; overflow-x: auto; overscroll-behavior-x: contain; touch-action: pan-x; scrollbar-width: none; }
  .cs-tabs::-webkit-scrollbar { display: none; }
  .cs-tab { flex: 0 0 auto; width: auto; white-space: nowrap; padding: 8px 12px; }
  .cs-tab[aria-selected=true] { box-shadow: inset 0 -3px 0 var(--copper); }
  .cs-tab-gap { display: none; }
  .cs-search-row { order: 2; padding: 0 12px 8px; }
  .cs.is-map .cs-search-row { display: none; }
  .cs-main { padding: 18px 12px 120px; }
  .cs-h1 { font-size: 26px; }
  .cs-field { grid-template-columns: minmax(0, 1fr); padding: 14px; }
  .cs-card-head, .cs-hist { padding-left: 14px; padding-right: 14px; }
  .cs select, .cs input[type=text], .cs input[type=search], .cs textarea { min-height: 44px; font-size: 16px; }
  .cs-btn { min-height: 44px; }
  .cs-check, .cs-switch { min-height: 44px; }
  .cs .cs-num { width: 96px; }
  .cs-dialog-head, .cs-dialog-body, .cs-dialog-foot { padding-left: 14px; padding-right: 14px; }
  .cs-dialog-foot .cs-btn { flex: 1 1 auto; }
}
`;

/** Adds the Studio's stylesheet to the page (once). */
export function addStudioStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
