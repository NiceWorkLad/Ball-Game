# Keep Up!

A keepy-uppy game for the browser: tap or click the ball to knock it back up, and don't let it drop. Every hit climbs one step of a 1000-hit journey from the pavement to the Moon, kept between goes; the record is getting there in the fewest goes. It's plain HTML, CSS and JavaScript, with no frameworks, no build step and no dependencies.

**Play it:** https://niceworklad.github.io/Ball-Game/

## Features

- **Fixed-step physics.** The simulation runs in 4 ms steps whatever the frame rate, and is drawn smoothly between steps, so the game plays the same on a 60 Hz laptop and a 120 Hz phone.
- **The Climb to 1000.** Eight sections of 125 hits each, from the Pavement to the Moon, in one tall world that creeps down past the board as you climb. Dropping the ball ends the go but keeps your height. Landing shows how many goes it took, with medals for 20, 40 and 60 goes or fewer.
- **Difficulty that ramps.** Within a go the sideways kick gets more random from a score of 10 to 50, and each section of the climb starts that randomness higher. The Moon has a sixth of normal gravity.
- **Touch-friendly.** Pointer events cover mouse, touch and multi-touch. Fingers get a bigger hit area than the mouse, and slightly late taps and fast swipes still count. Page zoom is turned off so two-thumb play can't zoom the page.
- **Three ball sizes** (Normal, Big, Huge), each with its own best score, tuned so they all play the same.
- **One art style:** minimalist, low-poly, colourful gradients, always gently moving, drawn on the canvas.
- **Sound.** Hit sounds play through the Web Audio API, with volume and mute controls.
- **Remembers you.** Your climb, records, best scores and settings are saved in cookies. The game pauses itself when you switch tabs.
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
| `GOAL`, `STAGES` | The climb's length and the hit each section starts at |
| `MEDALS` | The goes needed for each medal |
| `SECTION_RANDOMNESS` | The randomness each section starts from |
| `MOON_GRAVITY_SCALE` | Gravity on the Moon, as a share of normal |
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
