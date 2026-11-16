# The Climb to 1000: build plan

Branch: `climb-to-1000`. The live game at `/Ball-Game/` comes from `main` and stays as it is. A copy of this branch runs alongside it at `/Ball-Game/climb/` (see `climb/README.md` on `main`). When the climb is finished, merge this branch into `main` and delete `climb/`.

## Where things stand

| Step | What | Status |
| --- | --- | --- |
| 1 | Long world, camera, saved climb and goes, landing screen, medals, New climb | Done |
| 2 | Section art for all 8 sections, built in tiles only when near | Done (first pass) |
| 3 | The joins between sections | Mostly done |
| 4 | Difficulty by section, Moon gravity | Done |
| 5 | Animations | About half done |
| 6 | Progress meter and the finish | To do |
| 7 | Sound by height | To do |
| 8 | Test on real phones, then merge | To do |

Also done: a plain round ball (instead of the faceted one), and one finger at a time (on `main` too).

## The look

One style throughout: flat, colourful shapes with soft gradients, glows and warm plum shadows, lit from the top left.

- **Light:** a low morning sun at the end of the street, sunlight and shade across the two walls, shadows under every awning, sill, cornice and balcony, glowing lit windows, lamp, lanterns and neon.
- **Depth:** hazy far buildings down the street, a pale skyline behind the glass towers, haze where the towers meet the roofs, and a soft darkening towards the corners of the board.
- **Far layers** (drawn every frame, moving slower than the tiles): the sun above the rooftops, twinkling stars, and the Moon with seas, craters and a halo.
- **Sky things:** puffy clouds (a cloud bank in tiles, drifting ones live), the Earth with a glowing skin of air, faint colour clouds and star dust in deep space, two planets.
- **The ball:** soft shading with a shine, a faint motion blur, a squash on each hit, and a ring and sparks where it was hit. The score number pops on each hit.
- **The page** around the board takes its colours from the sky of the section you're in.
- Tiles now meet on whole screen pixels and are never drawn twice, so see-through art (glows, haze) has no seams.
- All motion respects `reducedMotion`.

## The infographic layer

Drawn over the art in the bold, outlined style of a size-comparison video (`drawFacts` and `drawHud` in `script.js`):

- **Height lines:** dashed lines at real heights with a fact each, from "1.7 m · Average person" through Big Ben, the Burj Khalifa, Everest, the edge of space and the ISS to "384,400 km · The Moon". They're in `FACTS`; add a line there to add one.
- **Height readout** (top left): the ball's real height, live.
- **Climb bar** (right edge): how far up the 1000 you are, with a notch per section. This covers most of step 6's height meter.
- `HEIGHTS` ties world altitude to real metres at landmarks in the art (lamp post 5 m, tallest tower 828 m, airliner 11 km, the Earth's edge 100 km, the station 400 km, the Moon 384,400 km). Between landmarks, height grows by multiplying, which is how a street and the Moon fit in one world.

Still to do: a setting to turn the labels off, and check the label sizes on a small phone.

## How the world works

- The world is one tall strip: 8 sections × `SECTION_H` (1600 units, two boards) = `WORLD_H` (12,800). Each hit moves the world `UNITS_PER_HIT` (12 units, about 1/67 of a board).
- Positions are **altitude**, measured up from the pavement. The art helpers (`box`, `poly`, `disc`, `block`, `pane`, `awning`, `label`, `cloud`) take altitudes, and `Y(a)` turns one into a y on whatever is being drawn.
- There are three kinds of art, drawn back to front by `drawWorld`:
  1. **Far layers**, drawn every frame: the sky gradient, the stars, and the Moon. The Moon moves more slowly than everything else, so it grows from a small disc at about 700 hits to a surface filling the top of the board at 1000.
  2. **Static art** (`STATIC_ART`), drawn once into tiles: buildings, shopfronts, towers, the cloud bank, the Earth's curve, distant planets. Each layer says which altitudes it covers.
  3. **Live art** (`LIVE_ART`), drawn every frame on top, but only while on screen: the person walking, pigeons, bunting and lanterns, the neon sign, washing, chimney smoke, the crane jib, the warning light, flocks, the light aircraft, the airliner, the space station, the satellite, the comet.

### Tiles: built only when needed

- Each tile is one board of altitude (62.5 hits). Tiles overlap by `TILE_PAD` so no seam shows.
- Tiles on screen are built straight away if missing (only on loading, switching ball size or starting a new climb).
- Tiles up to `LOOKAHEAD_HITS` (40 hits, about one good go) above the board are built ahead of time, one at a time, while the browser is idle.
- Tiles more than a board below or well above the camera are thrown away, so at most three or four exist at once.
- Tile sharpness follows the screen, capped by `MAX_TILE_SCALE` (2), so a tile is at most about 10 MB.
- Measured: under 1 ms per tile on a desktop, about 13 ms for the busiest tile at phone sharpness (60 fps held in testing). To check on a real phone, open the console and look at `keepUpTiles.stats` (tiles built, total and slowest ms) and `keepUpTiles.loaded()`.
- After a Moon landing the camera jumps back to the pavement rather than gliding down, so it doesn't build all 16 tiles on the way.

## Step 2 and 3: what's drawn

| Section | Hits | Static (tiles) | Live |
| --- | --- | --- | --- |
| Pavement | 0–124 | Paving and kerb, café and greengrocer shopfronts with signs and awnings, café table and chairs, fruit crates, lamp post, bin, bollards | Person walking, pigeons hopping |
| Shops & market | 125–249 | Tall market windows with awnings and flower boxes, a hanging bracket sign, the neon sign board | Bunting and paper lanterns swaying, the OPEN sign flickering |
| Apartments | 250–374 | Window grids (some lit), balconies with plants, air-con units, rooftops with chimneys, aerials and a water tank | Washing flapping, chimney smoke |
| Skyscrapers | 375–499 | Glass towers with 4 m floors, a spire, a helipad, the crane mast | Crane jib swinging, red warning light |
| Birds & planes | 500–624 | Low cloud bank (the join), higher thin cloud | V-shaped flocks, light aircraft, airliner with contrail |
| Space station | 625–749 | The Earth's curve fading into the haze (the edge of the atmosphere) | The station turning, solar panels catching the light |
| Space void | 750–874 | Two distant planets | Satellite blinking, comet |
| The Moon | 875–1000 | | The Moon growing, with craters, and the Earth rising behind |

Storeys shrink going up the street (shops 450 units, flats 200, towers 60), which is how the zoom-out shows.

### Still to do

- [ ] Each section's gameplay twist and sounds, decided as it's tuned (decided: "decided when built").
- [ ] Joins: the street to the market (125) and market to flats (250) read fine as one street. Check the rest on a phone.
- [ ] The person walks in front of the score number. Fine for now; revisit with step 6.

## Step 5: animations still to add

Each one is optional, so the climb never waits on them. All of them respect `reducedMotion`.

- Shops: awnings flapping
- Apartments: windows lighting up and going dark, a cat on a balcony
- Skyscrapers: glints across the glass, a window cleaner's cradle
- Moon: dust drifting, a flag or landing moment at 1000
- Stretch: things that react to the ball (birds scatter when it passes)

## Step 6: progress and the finish

- [x] Height meter: the climb bar and height readout on the board. The journey track on the start and drop screens is still there.
- [ ] Sort out the label under the board. "BEST n" is the best single go, which is easy to confuse with the fewest-goes record. Suggestion: `BEST GO 57 · RECORD 23 GOES`.
- [ ] Show the record per ball size on the start screen.
- [ ] Design the Moon landing: the ball touching down, then the goes count and medal.
- [ ] Check the medal targets (20 / 40 / 60 goes) feel right after some real climbs; they're in `MEDALS`.

## Step 7: sound by height

Built last, so it never holds up the climb.

- Street noise and market chatter at the bottom, wind and engines in the middle, near silence in space.
- One quiet ambient loop per section, crossfading as the camera moves. Load each loop only when its section is near, the same way as the tiles. Uses the existing Web Audio setup and the volume and mute settings.
- Check the licence of every sound added (like `icons/LICENSE-lucide.txt`).

## Step 8: test, then merge

- [ ] On an older phone, check smoothness at every section, especially the Pavement, the market floors and the flats (the busiest tiles), and check `keepUpTiles.stats`.
- [ ] Play a full climb with each ball size.
- [ ] Tune `SECTION_RANDOMNESS` (currently 0 → 0.9) and `MOON_GRAVITY_SCALE` from real play.
- [ ] Check that saved climbs survive a reload and a ball-size switch.
- [ ] Small fixes: the `favicon.ico` 404, and `ball.gravity: 0.2` in the ball object (it's set by `updateGravity()` anyway).
- [ ] Update `README.md` and `Handover.txt`.
- [ ] Open a pull request from `climb-to-1000` into `main`, merge, delete `climb/`, and check the GitHub Pages deploy.

## Ideas for future updates

Gameplay ideas borrowed from other games, roughly from most to least worth doing. None of these are decided.

| Idea | Seen in | How it could work here | Effort |
| --- | --- | --- | --- |
| Share your result | Wordle | After landing, a Copy button with a short text: "Keep Up! Moon in 23 goes 🥇" and a row of emoji per section. No server needed. | Small |
| Daily climb | Wordle, Spelunky daily | A short climb (say 200 hits) that's the same for everyone each day, with its own seed for the sideways randomness. One try per day. | Medium |
| Ghost of your record | Racing games, Trackmania | Beside the height meter, a faint marker for where your record climb was after the same number of goes, so you can see if you're ahead. | Small |
| Streak bonus | Tony Hawk, Guitar Hero | Every 25 hits in a single go without dropping gives a small height bonus, so long goes matter even more. | Small |
| Missions | Jetpack Joyride, Subway Surfers | Three small goals at a time, like "50 hits in one go in the Shops" or "land in under 30 goes", swapping out when done. | Medium |
| Unlockable ball skins | Crossy Road | Earned, not bought: a football for your first landing, a tennis ball for a Silver medal, a disco ball for Gold. Fits the medals. | Medium |
| Section twists | Doodle Jump, Flappy Bird | Wind gusts on the rooftops, birds that nudge the ball in Birds & planes, a few seconds of low gravity near the station. (Also the per-section twist still to decide.) | Medium each |
| Power-ups | Doodle Jump, Jetpack Joyride | A rare pickup floating in each section: a shield (one free drop), slow motion for 5 seconds, or a double-height hit. Taking the place of coins as the thing to chase. | Medium |
| Practice a section | Celeste chapter select | Play any section you've reached without it counting towards your climb. | Small |
| Online leaderboard | Most arcade games | Fewest goes to the Moon per ball size, worldwide or among friends. Needs a small server: a Rails API on srv-01 would do it. | Larger |
| Vibration on hit | Most mobile games | A short buzz on each hit (already in the pending list in `Handover.txt`). Android only; iPhones don't allow it in the browser. | Small |
| Pass-and-play | Party games | Two players take turns on one phone; whoever reaches the Moon in fewer goes wins. | Medium |
