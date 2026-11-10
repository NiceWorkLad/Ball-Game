# The Climb to 1000: remaining build plan

Branch: `climb-to-1000`. `main` (the live GitHub Pages game) stays untouched until everything below is done, then one merge deploys it all.

## Where things stand

| Step | What | Status |
| --- | --- | --- |
| 1 | Long world, camera, saved climb and goes, landing screen, medals, New climb | Done |
| 2 | Section art, bottom to top | Next |
| 3 | The joins between sections | To do |
| 4 | Difficulty by section, Moon gravity | Done |
| 5 | Animations | To do |
| 6 | Progress meter and the finish | To do |
| 7 | Sound by height | To do |
| 8 | Test on real phones, then merge | To do |

**Don't merge before step 2 is done.** Right now each section is a placeholder (sky gradient, faceted shapes, a marker line), and the old hills, streets and planets are gone.

## How the world works (for every step below)

- The world is one tall strip: 8 sections × `SECTION_H` (1600 units, two boards) = `WORLD_H` (12,800).
- Positions are **altitude**, measured up from the pavement. Convert to the board with `screenY(a, camAlt)`; `camAlt` is the altitude of the board's bottom edge.
- `drawWorld(now, camAlt)` in `script.js` draws everything. Only draw what's in view (`camAlt` to `camAlt + WORLD`) to stay well under 1 ms a frame.
- The low-poly helpers (`makeRidge`, `drawRange`, `drawStreet`, `lowPolyCloud`, `lowPolyTree`, `lowPolyDisc`) still use board coordinates. Use them inside a `ctx.translate(0, screenY(...))` rather than rewriting them.
- Each section gets its own palette in `PALETTES` (currently placeholders: `page`, `ink`, `accent`, `band`).

## Step 2: section art, bottom to top

Replace each section's placeholder shapes with real scenery, **to scale inside the section**. One commit per section, so each can be checked on its own.

Suggested shape: a `SECTION_ART` object with one draw function per section key, called from `drawWorld` only when that section is in view.

| Order | Section | Hits | Draw | Scale anchor |
| --- | --- | --- | --- | --- |
| 1 | Pavement | 0–124 | Paving slabs and kerb, lamp post, bin, bollards, shop windows at street level, a person | Person 1.7 m, door ~2.1 m |
| 2 | Shops & market | 125–249 | Striped awnings, shop signs, bunting and lanterns across the street, café terrace | Storeys ~4 m |
| 3 | Apartments | 250–374 | Window grids, balconies with plants, washing line, air-con units, rooftops and chimneys | Floors ~3 m |
| 4 | Skyscrapers | 375–499 | Glass towers, tower crane, helipad, spire with a red light | Tower floors ~4 m |
| 5 | Birds & planes | 500–624 | Cloud layers, V-shaped flocks, light aircraft, airliner with contrail | Airliner 70 m |
| 6 | Space station | 625–749 | Earth's curve with a thin blue glow, the station with solar panels | Station 110 m |
| 7 | Space void | 750–874 | Mostly empty: stars, a satellite, a comet | Deliberately empty |
| 8 | The Moon | 875–1000 | The Moon growing until its cratered surface fills the top of the board | Craters 1–100 km |

For each section, settle as it's built (decided: "decided when built"):

- [ ] Palette (`page`, `ink`, `accent`, plus scenery colours)
- [ ] Any gameplay twist on top of the difficulty step
- [ ] What it should sound like (noted now, built in step 7)

Also in this step:

- [ ] Show the Moon earlier. At the moment it only comes into view from about 967; it should be growing through the whole Moon section.
- [ ] Remove `PLACEHOLDERS` and the section marker lines once every section has art.

**Done when:** every section has art, and the strip reads as one continuous world when you drag through all 1000 (add a temporary debug slider if that helps).

## Step 3: the joins

Each zoom change between sections is hidden behind something that naturally fills the board:

| Between | Join |
| --- | --- |
| Pavement → Shops | Shop signs and awnings |
| Shops → Apartments | First-floor windows |
| Apartments → Skyscrapers | Rooftops and chimneys |
| Skyscrapers → Birds & planes | Low cloud bank |
| Birds & planes → Space station | Edge of the atmosphere |
| Space station → Space void | Stars fading in |
| Space void → Moon | The Moon filling the view |

**Done when:** there's no visible seam or jump in scale at 125, 250, 375, 500, 625, 750 and 875.

## Step 5: animations

Small moving details, a few at a time. Each one is optional, so the climb never waits on them. All of them respect `reducedMotion`.

- Pavement: pigeons hopping, people walking past, a crisp packet blowing along
- Shops: bunting swaying, awnings flapping, a neon sign flickering
- Apartments: washing flapping, windows lighting up, smoke from a chimney
- Skyscrapers: crane jib swinging, red lights blinking, glints across glass
- Birds & planes: flocks crossing, planes with growing contrails, drifting clouds
- Space station: the station turning slowly, panels catching the light
- Space void: stars twinkling, a comet streaking past
- Moon: dust drifting, Earth rising behind

Stretch: things that react to the ball (birds scatter when it passes).

## Step 6: progress and the finish

- [ ] Replace the journey track with a slim height meter beside the board: current height, section marks, a tick for the Moon.
- [ ] Sort out the label under the board. "BEST n" is the best single go, which is easy to confuse with the fewest-goes record. Suggestion: `BEST GO 57 · RECORD 23 GOES`.
- [ ] Show the record per ball size on the start screen.
- [ ] Design the Moon landing: the ball touching down, then the goes count and medal.
- [ ] Check the medal targets (20 / 40 / 60 goes) feel right after some real climbs; they're in `MEDALS`.

## Step 7: sound by height

Built last, so it never holds up the climb.

- Street noise and market chatter at the bottom, wind and engines in the middle, near silence in space.
- One quiet ambient loop per section, crossfading as the camera moves. Uses the existing Web Audio setup and the volume and mute settings.
- Check the licence of every sound added (like `icons/LICENSE-lucide.txt`).

## Step 8: test, then merge

- [ ] On an older phone, check smoothness at every section, especially Shops, Skyscrapers and Birds & planes.
- [ ] Play a full climb with each ball size.
- [ ] Tune `SECTION_RANDOMNESS` (currently 0 → 0.9) and `MOON_GRAVITY_SCALE` from real play.
- [ ] Check that saved climbs survive a reload and a ball-size switch.
- [ ] Small fixes: the `favicon.ico` 404, and `ball.gravity: 0.2` in the ball object (it's set by `updateGravity()` anyway).
- [ ] Update `README.md` and `Handover.txt`.
- [ ] Open a pull request from `climb-to-1000` into `main`, merge, and check the GitHub Pages deploy.

## Tuning values in `script.js`

| Constant | Now | What it does |
| --- | --- | --- |
| `GOAL` | 1000 | Length of the climb |
| `STAGES[].at` | every 125 | Where each section starts |
| `MEDALS` | 20 / 40 / 60 | Goes needed for Gold / Silver / Bronze |
| `SECTION_RANDOMNESS` | 0 … 0.9 | Randomness each section starts from |
| `MOON_GRAVITY_SCALE` | 1/6 | Moon gravity as a share of normal |
| `CAMERA_EASE_MS` | 220 | How quickly the camera catches up |
