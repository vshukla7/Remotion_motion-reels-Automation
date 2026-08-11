## Modular Minimalist Video Editing Agent

Turns a transcript into a rendered 9:16 vertical video: one continuous camera
move across a set of pre-built "scenes," each triggered by word-level timing.

## 1. Render Config
- **Resolution:** `1080x1920` (9:16 vertical) — always. Never horizontal.
- **FPS:** 60.
- **Look:** minimalist, high-contrast, tech-focused, smooth spring motion.
- **Folders:** `assets/` (backgrounds, sfx, downloaded/processed images, transcript JSON) → `export/` (final MP4).

## 2. The Canvas & Camera Model (core mental model — read this first)
Everything lives on **one persistent canvas**. Every scene is a fixed `(x, y)`
position on it and is mounted for the whole video — nothing is
cut/faded/unmounted between scenes. The only thing that moves is the camera,
panning and zooming from one scene's position to the next.

- **Camera easing:** every pan uses one "fast, then slow" curve
  (`cubic-bezier(0.16, 1, 0.3, 1)`), so all moves feel consistent regardless
  of direction.
- **Vary the direction:** don't pan the same way twice in a row — mix
  left/right/up/down/diagonal moves so the canvas reads as one big space, not
  a slideshow.
- **Sync scene animation to camera arrival:** each scene's internal
  animations (text, icons, cards) must key off `localFrame = frame -
  sceneFrame`, where `sceneFrame` is the frame the camera *starts* panning
  toward it — not off the global timeline frame 0. This is what makes a
  scene "reveal" as the camera arrives instead of appearing already-finished
  or looking like a jump cut.
- **Match text direction to camera direction:** if the camera just panned
  right to reach a scene, that scene's text should enter sliding in from the
  right (and so on for left/up/down/diagonal pans). Direction should always
  agree between camera and content.

## 3. Kinetic Typography
- Words mount word-by-word, synced to transcript timestamps (±1 frame @ 60fps).
- Each word moves on **one diagonal path** — vertical (`up`/`down`) and
  horizontal (`left`/`right`) offset animated together off the same spring —
  not two separate "modes." Scale `0.8 → 1.0` optional; default is
  translate + fade. Motion curve: tight spring (high stiffness, low damping)
  for a snappy ease-out.
- **Keyword highlight:** wrap high-priority words/metrics in a solid
  `#111111` box, white inverse text. It reveals with a **center-out wipe**
  (opens symmetrically left and right from the middle), not a directional
  slide. If a highlighted phrase spans multiple words, treat the whole
  phrase as one wipe unit — don't split it.

## 4. Scene Background Rule
- If a scene uses a static image from `assets/backgrounds/`: let the image
  fill the frame. No off-white canvas, no vignette shapes.
- Otherwise: solid `#F5F5F5` canvas + two large, heavily blurred abstract
  shapes fixed at top-left and bottom-right for a subtle vignette.

## 5. Scene Library
Pick a scene type per transcript segment based on trigger context. Each has
one base behavior; vary the specific execution rather than maintaining rigid
sub-variants.

| Type | Trigger context | Base behavior |
|---|---|---|
| **A — Hook** | First 3–5s, topic intro | Central icon/logo scales in; text updates per word |
| **B — Network** | Integrations, platforms, teams | Nodes/logos arranged on a ring or grid, connecting lines draw in |
| **C — Anticipation** | "Watch till the end," section shift | Progress bar or radial timer fills over the phrase duration |
| **D — Product Reveal** | Feature/spec callouts | Rounded UI cards spring in (slight overshoot), grid columns match card count |
| **E — Process** | Step-by-step, automation, chat/AI flow | Stacked UI blocks slide in bottom-up; camera tracks the growing stack |
| **F — Problem vs Solution** | Pain points, before/after | Problem items strike out; solution cards spring in to replace them |
| **G — CTA** | "Follow," "Download," "Link in bio" | Logo drops in center; action text anchored beneath |

Feel free to improvise the specific visual treatment within a type (e.g. a
grid vs. a ring for Scene B) — the trigger context and base behavior are
what matter, not a fixed list of named variants.

## 6. Dynamic Assets (never hardcode)
When the transcript names a real entity (person, brand, tool):
1. Check `assets/` for an already-processed PNG.
2. If missing, run `scripts/asset_processor.py` to fetch a high-res image/logo.
3. Strip its background (`rembg` or equivalent).
4. Save the transparent PNG to `assets/` for the Remotion render to import.

**SFX:** only use files already in `assets/sfx/` — never reference a missing
file. Rough mapping: UI/card motion → soft swoosh; stamps/strikethroughs →
heavy thud; word-mount ticks → subtle randomized clicks/pops on stressed words.

## 7. Pipeline
```bash
# 1. Parse transcript, fetch/clean any missing entity assets
python3 scripts/asset_processor.py --transcript core_assets/transcript.json

# 2. Render
npx remotion render src/index.ts StyledSample export/final_output.mp4 \
  --fps=60 --width=1080 --height=1920
```