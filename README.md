# Air Rush

A local 2D air hockey game written in plain JavaScript, with HTML and CSS.
No installation, account, internet connection, or build step is needed.

## Play
Open index.html in a current desktop browser. Keep engine.js, game.js, and
style.css in the same folder as index.html. Choose settings and click Start match.
The separate air-rush.html deliverable is a self-contained version of the same game.

## Controls
- Player 1 (bottom): A / D.
- Player 2 (top, local versus): Left / Right arrows.
- Escape or Pause: pause/resume.
- Paddles move horizontally only.
- Leaving the browser window or switching tabs automatically pauses the match.
- Both players can hold their controls simultaneously. Keyboard hardware can
  limit some simultaneous key combinations.

## Modes and settings
- Play the bot: Easy, Normal, or Hard.
- Local versus: two players sharing one keyboard.
- Winning score: 5, 10, 15, or a custom integer from 1 to 50. Default: 10.
- Puck speed: Slow (0.65x), Normal (1x), Fast (1.4x).
- Random rush: on by default, with an off switch.
- Preferences and sound choice are saved locally when browser storage is available.
- Match settings are locked during a match. Pause and return to setup to change them.

## Random rush
By default, after a random 15–30 seconds of active play, an amber warning starts
a 3-second countdown. Rush then lasts 8 active seconds.
The puck becomes 50% faster and both paddles become 15% faster.
Table accents turn orange/red while player colors remain cyan and pink.
Normal speed returns at the end; boosts do not stack.
Rush timers freeze during pauses, goal celebrations, and serve countdowns.
The current rush phase carries across goals until its active-play timer expires.
A new random wait starts after each rush.

Advanced rush settings:
- Minimum wait: 5–60 seconds.
- Maximum wait: at least the minimum, up to 90 seconds.
- Duration: 3–20 seconds.
- Puck boost: +25%, +50%, +75%, or +100%.
Short matches may finish without a rush; activation is independent of score.

## Gameplay
Goals occupy the center 40% of each end wall.
Each goal earns one point. The first player to reach the target wins immediately.
The first serve chooses a receiving player randomly; later serves go toward
the player who conceded. Each serve has a 3-second countdown.
Paddle edges aim sharper shots; moving the paddle adds a small sideways influence.
Sound effects have a mute control. Reduced-motion preferences limit visual effects.

## Source
- index.html — interface and settings.
- style.css — layout, colors, responsive behavior, reduced motion.
- engine.js — physics, scoring, bot, rush, match state; also exports to Node.
- game.js — keyboard input, canvas rendering, UI, local preferences, audio.
- tests/engine.test.cjs — engine regression tests.

The physics use a fixed 600 × 800 coordinate system and small movement steps.
The drawing scales independently with the display. No remote assets or packages.

## Test
With Node.js installed, run from this folder:
    node --test tests/engine.test.cjs

Nine automated tests pass: movement, fast collisions, goal boundaries, scoring
and victory, rush transitions, pause/timer freezing, bot limits, time handling,
and configuration/reset behavior. Browser visual and interaction playtesting
was unavailable in the authoring environment; the local preview connection
timed out and its built-in browser does not permit file URLs.

