# Keep Up!

A keepy-uppy game for the browser: tap or click the ball to knock it back up, and don't let it drop. It's plain HTML, CSS and JavaScript, with no frameworks, no build step and no dependencies.

**Play it:** https://niceworklad.github.io/Ball-Game/

## Features

- **Fixed-step physics.** The simulation runs in 4 ms steps whatever the frame rate, and is drawn smoothly between steps, so the game plays the same on a 60 Hz laptop and a 120 Hz phone.
- **Difficulty that ramps.** The sideways kick has no randomness up to a score of 10 and gets more random up to a score of 50.
- **Touch-friendly.** Pointer events cover mouse, touch and multi-touch. Fingers get a bigger hit area than the mouse, and slightly late taps and fast swipes still count. Page zoom is turned off so two-thumb play can't zoom the page.
- **Three ball sizes** (Normal, Big, Huge), each with its own best score, tuned so they all play the same.
- **Six colour themes**, including a hand-drawn Sketchbook theme, plus six fonts. Themes are blocks of CSS colour variables.
- **Sound.** Hit sounds play through the Web Audio API, with volume and mute controls.
- **Remembers you.** Your best scores and settings are saved in cookies. The game pauses itself when you switch tabs.
- An arrow at the top edge shows where the ball is when it goes off screen.

## Run it locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8080   # then visit http://localhost:8080
```

## Tuning

The feel of the game is set by constants in `script.js`:

| Constant | What it controls |
| --- | --- |
| `RANDOM_START`, `RANDOM_FULL` | The scores where sideways randomness starts and peaks |
| `HIT_SCALE` | How much bigger the hit area is for touch |
| `TAP_BUFFER_MS`, `LATE_TAP_MS` | How forgiving early and late taps are |

## Files

| File | What it is |
| --- | --- |
| `index.html` | Page structure and the embedded icon sprite |
| `script.js` | Game loop, physics, input, sound, settings |
| `styles.css` | Layout and the colour themes |
| `sounds/` | Ball hit sounds |
| `icons/` | Lucide icons and their licence |

## Credits

Icons from [Lucide](https://lucide.dev) (ISC licence, see `icons/LICENSE-lucide.txt`).
