# Gravity Drop

A marble-race name picker. Paste in names. Each one becomes a marble that drops through a randomly built obstacle course full of things that spin, blow and move. It is pure physics: nothing intervenes in the race. The first marble across the finish line wins (or, in "last one standing" mode, the last one left).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the production build
```

Keys: **Space** drops (and races again from the winner screen), **Esc** goes back to setup, **M** mutes, **F** toggles fullscreen. Click a name in the standings to follow that marble with the camera.

## How the race works

- **Course.** Marbles are jumbled in a lottery-style mixer (sweeping air jets in the floor) during the countdown, then the floor drops. Seeded segments are stacked between the mixer and a finale, picked at random or chosen in the setup (**Final drop**): *Pinball*, a spread-out diamond of pop bumpers above two evenly spaced rows of bumpers with slingshots on the walls, or *Mayhem*, a long finale that packs in most of the obstacles in the game. Both end in a funnel lined with slingshot kickers and a pair of flippers. The segments are Peg Garden (a tall field of plain pegs), Trapdoor Floor (three floors of ever smaller trapdoors), Shifting Shelves (lots of small sliding shelves, with fixed side shelves so nothing falls straight down a wall), Trampoline Park (rows of short tilted pads that spring marbles off at an angle; the ones in the middle slowly rock), Portal Maze (a peg field where two portals patrol a clear row, sliding left and right; get caught and you go back to the top) and Windmill Grinder (a long field of alternating windmill rows, mostly small, with one big windmill in the middle). *Short* uses 4 segments, *Medium* 7, *Epic* 11.
- **Funnels** (optional): every segment squeezes into a narrow throat in the middle before the next one, guarded by a rotating cast of obstacles: a paddle wheel, a valve that holds the pile and then bursts open, a pulsing updraft, a shuttling shelf or a splitter bumper. Bunching the pack at each funnel means more lead changes.
- **Safety nets.** A marble that sits still for 3.5 s gets nudged. A marble that makes no progress for 20 s gets dropped a little further down. In testing that happens about once every 10–25 races.
- **Fairness.** Start slots are shuffled and every marble has identical physics. The sim only advances in fixed 1/120 s steps, so "Replay this race" replays the identical race (each race gets a random internal seed).

### Checking fairness

The simulation (`src/sim/`) has no rendering dependencies, so it runs headless in Node:

```bash
npm run fairness -- 600 short first 6        # races, length, mode, names, seedOffset, funnels(1/0), finale(random/pinball/mayhem)
npx tsx scripts/inspect.ts 42 medium 8       # one seed: segment layout, event counts, final positions
```

Sample result (600 races, 6 names): every name won 14.7–17.7% of races (an even split is 16.7%), with χ² = 2.5 and no timeouts.

## Deploy to GitHub Pages (free)

1. Create a **public** GitHub repo (Pages on a free account needs a public repo) and push this folder to its `main` branch.
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Every push to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml). The site appears at `https://<user>.github.io/<repo>/`.

`vite.config.ts` uses a relative `base`, so it works under any repo name.

## Project layout

```
src/
  main.ts            app state machine (setup → race → winner), frame loop, events → audio/callouts
  sim/               headless simulation (Rapier 2D physics)
    sim.ts           Sim class: marbles, stepping, ranking, finish, rescues
    course.ts        segment templates + seeded course generator
    builder.ts       walls, pegs, bumpers, windmills, sliders, trapdoors, flippers, see-saws
    zones.ts         fans, conveyors, lifts, boosters, portals
  render/            PixiJS renderer, effects, palette
  audio/sfx.ts       Web Audio sounds, all synthesized (no audio files)
  ui/                setup screen (localStorage: names, lists, settings, history) and HUD
scripts/             headless fairness and inspection tools
```
