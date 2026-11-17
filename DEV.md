# Dev build (`dev-options` branch)

This branch is the game plus a **Developer** section at the bottom of Settings, for testing and trying out changes that might break the game. It isn't for players: don't merge it into `main`.

- **Every knob is one entry in `DEV_OPTIONS`** at the top of `script.js` (group, key, label, type, default, range, help). The panel is built from that list, so adding an entry adds a control. The game reads the value as `DEV.<key>`.
- **Saved in this browser only** (`localStorage`, key `ballgame_dev`), and only the options you've changed. Each changed option has a ↺ to reset it, and there's **Reset all dev options**.
- **Its own saves:** every cookie is prefixed `dev_`, so climbs, bests and settings here never touch the real game's.
- **The ` key** opens or closes Settings at any time, pausing the go. The gear also shows while paused.
- A red **DEV** badge (top left) counts how many options are changed.

## The options

| Group | Options |
| --- | --- |
| Physics | Game speed, Freeze physics, Gravity, Gravity angle (hits push against gravity), Moon gravity, Hit power, Sideways kick, Kick randomness (Auto or fixed), Harder by section, Wall bounce, Floor bounce, Air drag, Speed limit, Side walls (bounce / wrap / none), Ceiling |
| Balls | Number of balls (1–20), Ball radius, Balls collide, Go ends when (any ball drops / all drop / never) |
| Input | Hit area, Hit cooldown, Tap buffer, Late tap, Several fingers (turns off one finger at a time), Autoplay (a bot hits the balls and starts the next go) |
| Climb | Climb per hit, Camera ease |
| Look | Height readout & bar, Height lines, Ball trail, Squash on hit, Hit ring & sparks, Show hit areas, Debug readout (fps, state, climb, every ball's position and speed) |
| Sound | Hit pitch |
| Jump | Go to any climb height; End this go (needed when Go ends when is Never) |

## Keeping it up to date

Merge `climb-to-1000` (or `main`) into this branch to pick up new work. The things most likely to conflict are the physics and input code, because this branch turns the single ball into a list (`balls`, with `ball` as the first) and moves `dx`/`dy` onto each ball as `b.dx`/`b.dy`.
