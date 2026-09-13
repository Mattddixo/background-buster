# Background Buster — Design

A self-hosted tool for producing backgrounds — for a phone, a desktop, a TV,
whatever — from a starting photo/GIF or from a handful of built-in generators.
Runs as one Docker container on the homelab, reachable over Tailscale on
`:8081`. No accounts, no gallery, no database. You open it, you make a
background, you download it, it forgets you existed.

## Non-negotiables

- **Never stores what you upload.** A photo or GIF exists only for the
  duration of the request that processes it: in memory (or a tmpfs-backed
  scratch dir for the GIF re-encode step, which shells out to `ffmpeg`), and
  it is deleted/dereferenced as soon as the response is sent — success or
  error. No disk write to a persistent volume, no DB row, no filename or
  image bytes in logs. This is enforced structurally (see *Ephemeral
  processing*, below), not just documented.
- **Quality is preserved, not "good enough."** No accidental double
  JPEG re-compression, no naive stretch-to-fit, no upscaling past source
  resolution without you explicitly asking for it, no GIF palette banding
  from lazy resizing. Details under *Image quality pipeline*.
- **Stateless container.** No volumes required at all. Nothing to back up,
  nothing to leak, nothing to migrate. Restarting it loses nothing because
  there was never anything to lose.

## What it does (v1)

1. **Bring your own image or GIF.** Upload a photo (JPEG/PNG/WebP/AVIF) or a
   GIF. Pick a target (a device preset or a custom W×H). Choose a fit mode.
   Download the result. That's the whole loop.
2. **Or generate one from scratch**, no upload needed: solid, linear/radial
   gradient, mesh gradient, low-poly/geometric, and plasma/noise styles,
   each with a seed so "I liked that one, give me a variant" is a real
   button, not a request for magic.
3. **Fit modes**, applied to whichever source you used:
   - **Cover** — crop to fill the target exactly. Uses saliency-aware
     cropping (see below) instead of a blind center-crop, so it doesn't
     casually decapitate the subject of your photo.
   - **Contain, blurred backdrop** — the whole image fits inside the frame;
     the letterbox bars are filled with a heavily blurred, scaled copy of
     the same image instead of flat black. Looks intentional. This is the
     default for aspect ratios that are far from the source's.
   - **Contain, solid pad** — same as above but with a flat color (auto-
     picked from the image's dominant edge color, or user-chosen).
4. **GIF handling** — Cover fit only (see *Image quality pipeline* for why),
   with frame timing and loop count read from the source and reapplied
   exactly, so a looping GIF still loops the same way after resizing.
5. **Collages.** Upload 2–9 photos, drag to reorder, pick a target — they're
   auto-arranged into a grid (rows × cols chosen to best match the target's
   aspect ratio, not just to minimize empty cells) with each photo
   Cover-fit into its own cell using the same saliency-aware crop as single
   photos. A thin gutter separates cells; any unfilled trailing cell (e.g.
   5 photos in a 6-cell grid) just shows as the gutter color rather than
   forcing an awkward uneven layout.
6. **Manual crop/rotate/flip**, available from both Upload and Collage. The
   automatic crop above is the default everywhere; opening a photo's editor
   (pencil icon) lets you pan, zoom, and rotate in 90° steps against the
   exact aspect ratio it'll actually be placed at — the overall target for
   Upload, that specific cell for Collage — instead of guessing whether the
   automatic crop kept the right part of the photo. See *The shared photo
   editor*, below.

Not in v1, deliberately: AI image generation (different tool, different
resource profile — see the earlier discussion of Fooocus/ComfyUI), user
accounts, a saved-history gallery, video/MP4 export, multi-monitor
spanning, non-grid collage layouts (strip, freeform scatter — see the
follow-up discussion), free-angle rotation (90° steps cover the actual
common case — a sideways phone photo — losslessly; free rotation needs
lossy interpolation for marginal benefit), and brightness/contrast/
saturation adjustments (a clean independent add-on once framing is solid).
These are plausible v2 candidates, not scope creep to half-build now.

## Ephemeral processing — how "doesn't store photos" is actually enforced

The upload handler never calls anything that writes to a path outside
`os.tmpdir()`/an in-memory `Buffer`. Concretely:

- Multipart uploads (photo, GIF, and each photo in a collage) are parsed
  straight into memory via `@fastify/multipart`'s buffer API — never its
  disk-storage mode. `sharp` and the GIF/collage pipelines operate entirely
  on in-memory buffers; nothing in this app writes a file to disk at any
  point, so there's no temp directory to clean up in the first place.
- The request logger (`pino`) has a redaction/serializer config that logs
  method, route, status, duration, and byte-count — never body content,
  never the original filename verbatim (it's hashed for correlation across
  two log lines of the same request, nothing more).
- Output images are streamed to the response and never cached server-side
  (no reverse-proxy cache, no `ETag`-keyed disk cache — there is nothing to
  key a cache on that would be worth the privacy tradeoff for a single-user
  tool).

## Image quality pipeline — the "smart" part

- **Library: `sharp`** (libvips binding). Chosen specifically because it
  does one decode → operate → encode pass instead of chaining lossy
  round-trips, uses good resampling by default (Lanczos3 for downscale),
  and supports 16-bit-per-channel processing internally so gradient/mesh
  generators don't band before the final encode.
- **EXIF orientation is applied before any geometry op**, then EXIF/GPS
  metadata is stripped from the output. (Privacy follow-on from the no-
  storage rule: if we're not keeping your photo, we're also not leaking
  where it was taken.)
- **Saliency-aware cropping** for Cover mode: `sharp`'s attention crop
  strategy picks the region to keep instead of a blind center-crop. Cheap,
  no ML model to ship, and correct often enough to be the sane default —
  a manual override for when it guesses wrong is a fair v2 ask, not a v1
  gap that blocks anything.
- **No upscaling past source resolution by default.** If your source is
  smaller than the target preset, the UI says so up front and offers two
  honest choices: pick a smaller target, or explicitly opt into upscaling
  (Lanczos, clearly labeled as lossy) — never a silent stretch.
- **Format is chosen by content, not by habit:** an image with an alpha
  channel goes to PNG or WebP (never flattened to JPEG and losing
  transparency); a photo goes to WebP or JPEG (`mozjpeg` encoder, quality
  ~92 default) — user can override format/quality, but the default is
  picked correctly rather than left at some library default that happens
  to be lossy.
- **GIFs are resized as what they are — animated, not a flat image**:
  `sharp`'s native animated-image support (built on the same libvips
  pipeline as everything else, no separate tool or format conversion in
  the middle) resizes every frame in one pass and reads the source's frame
  delays and loop count back out to reapply them on the way out, so a
  looping GIF still loops the same way afterward. Per-frame blur/pad
  compositing for the Contain modes isn't implemented on an animated
  source — it fails with a clear message rather than silently shipping a
  misaligned result, which is why GIFs are Cover-only for now.
- **Collages reuse the exact same Cover-fit + upscale-guard code path**
  as a single photo, once per photo against its own cell size — a photo
  that's smaller than the cell it lands in trips the same "won't silently
  upscale" guard, named to that specific photo so it's obvious which one
  to swap out or shrink the grid for.
- **Device presets carry real pixel counts**: phone/TV presets already
  reflect actual device pixel counts (not points-scaled-down), so a phone
  preset doesn't quietly hand you a blurry under-sized file.

None of this requires an AI model or GPU — it's correct use of a mature
image library, which is 90% of what "quality" means for this use case.

## Device presets

Curated list grouped by category, plus a free-form **custom W×H / aspect
ratio** field that's always available (this is the escape hatch — the
curated list is convenience, not a wall):

- **Phone**: a handful of current common iOS/Android logical resolutions
  (portrait + landscape variants)
- **Desktop**: 1920×1080, 2560×1440, 3840×2160, plus common ultrawide
  (3440×1440)
- **TV**: 3840×2160 (4K), 7680×4320 (8K)
- **Custom**: any W×H, or an aspect ratio with one dimension locked

When a photo is uploaded, presets whose aspect ratio is closest to the
source are sorted to the top — a small bit of "smart defaults" that saves
the common case of scrolling a list.

## Visual design direction

Explicitly avoiding the generic-SaaS look (soft purple/blue gradient hero,
big rounded cards, drop shadows everywhere, Inter font, everything
centered in a 600px column). Direction instead:

- **A darkroom/lightbox aesthetic.** Flat, high-contrast, functional — the
  UI reads like a piece of photo equipment, not a marketing site. Dark
  neutral background (near-black, not navy), one warm accent color (a
  darkroom safelight red/amber, not blue/purple), sharp corners, no drop
  shadows — separation between elements comes from contrast and thin
  hairline borders, not elevation.
  This is the primary intended direction unless research below turns up a
  reason to adjust it.
- **Monospace for anything technical** — dimensions, file size, format,
  seed values — proportional font for everything else. Makes it feel like
  a tool, not a landing page.
  Should this be the actual look, or is a different unique direction
  preferred? Worth a two-minute gut check before it's built, ideally with
  a couple of quick visual mockups to react to rather than deciding from
  prose alone.
- **The canvas is the UI.** A live preview at the actual target aspect
  ratio dominates the screen; controls are a slim side panel, not a form
  above the fold.
- No stock illustrations, no gradient blobs, no emoji as icons.

## Architecture

Two workspaces in one repo, one Docker image:

```
background-buster/
  server/                  Node.js + TypeScript API
    src/
      api/                 thin HTTP layer (routes, request parsing/validation)
      pipeline/
        photo/             upload -> orient -> fit -> encode
        gif/                same shape, sharp's native animated-image path
        collage/            grid layout math + per-photo orient -> fit -> composite
        generators/         gradient, mesh, low-poly, plasma, solid — pure functions
        shared/             fit-mode math, orientation, color utils, format rules — reused by all of the above
      presets/             device preset data + aspect-ratio matching
      config/              env-driven config, one module, validated at boot
      logging/             pino options + redaction rules
    test/                  Vitest — pipeline modules are pure functions, tested without HTTP
  web/                     TypeScript + Vite, no UI framework
    src/
      components/          small, framework-free, hand-rolled DOM modules
      styles/
  Dockerfile               multi-stage: build -> slim Debian runtime, non-root user
  docker-compose.yml        exposes 8081, tmpfs mount for /tmp, no persistent volumes
  DESIGN.md                 this file
```

Why no frontend framework: this is a single-page tool with maybe a dozen
interactive controls and a canvas preview. React/Vue/Svelte would mean
either the generic component-library look this is deliberately avoiding,
or fighting the framework to get something unique — plain TypeScript with
hand-written CSS is less code here, not more, and guarantees the UI looks
like nothing else.

Why Node/TypeScript over Python or Go for the backend: `sharp` (libvips)
is best-in-class for exactly this workload and is a first-class Node
package; TypeScript end-to-end means one language, shared types for the
preset list and API request/response shapes between `server/` and `web/`,
and no serialization mismatch to maintain by hand.

### Module boundaries (the "reusable" part)

- `pipeline/shared` has zero knowledge of HTTP — it's pure functions
  (`applyFit(source, target, mode)`, `orientImage(buffer)`,
  `pickFormat(hasAlpha, isAnimated)`, `matchPresetsByAspect(w, h, presets)`).
  The photo, GIF, and collage pipelines all call into the same `applyFit`
  and `orientImage` instead of each re-implementing crop/orient math —
  collage in particular is "call the photo pipeline's fit logic once per
  cell" rather than a separate implementation.
- `pipeline/generators/*` each export a single `generate(seed, width,
  height, options) -> Buffer` function with the same signature, so adding
  a new style later is "write one new file," not "touch the router."
- `pipeline/collage/grid.ts` isolates the layout math (`chooseGrid`,
  `distribute`) from composition, so the "which grid shape looks least
  broken for N photos" heuristic is unit-testable without touching sharp.
- `api/` routes do request validation and call one pipeline function each;
  no business logic lives in a route handler.

### The shared photo editor

Manual crop/rotate/flip is one implementation used from two tabs, not two
implementations that happen to look similar — this was a deliberate
decision (see the design discussion this followed from): the alternative,
bolting a cropper onto the Collage cell view alone, would mean rebuilding
it when Upload needed the same thing.

- **`CropSpec`** is the one type duplicated between `server/` and `web/`
  (everything else crosses the wire as data, not reimplemented logic — see
  the collage layout endpoint below). It's fully normalized: `rotation`
  (0/90/180/270), `flipH`/`flipV`, and `x`/`y`/`width`/`height` as fractions
  (0–1) of the image *after* rotation and flip. Declaring it this way means
  the same spec produces the same crop regardless of actual pixel
  dimensions on either side of the wire.
- **`web/src/components/photoEditor.ts`** is the one editor component.
  Rotation and flip are baked into an offscreen canvas on each toggle
  (`ctx.rotate`/`ctx.scale`) rather than composed as live CSS transforms,
  so the continuous pan/zoom math never has to reason about a rotated
  coordinate system — only the discrete "rebuild the working canvas, reset
  the view" step does. Pan and zoom use Pointer Events (not HTML5
  drag-and-drop), so a mouse and a touch screen run the exact same code
  path. Zoom is capped so you can't drag it past the point where the crop
  would need to upscale to reach the target's actual pixel dimensions,
  with a visible "upscaled Nx" readout if `allowUpscale` lets you go past
  that cap anyway.
- **`server/src/pipeline/shared/manualCrop.ts`** is the one server-side
  implementation, called by both `pipeline/photo` (against the overall
  target) and `pipeline/collage` (against each cell, alongside the
  automatic path for any photo that wasn't manually edited) — the same
  shape as `applyFit`, sharing its `assertNoUpscale` guard.
- **`GET /api/collage/layout`** exists specifically so the client never
  reimplements the grid math. The editor needs to know a photo's cell's
  *exact pixel size* before any file is even uploaded (to size its crop
  frame and compute the zoom cap); rather than port `chooseGrid`/
  `distribute` to TypeScript-on-the-client and risk the two copies
  drifting apart, the client fetches the answer from the same function
  `pipeline/collage` uses to actually render. A request-token guard in
  `main.ts` discards any layout response that isn't from the most
  recently issued request — added after a browser test caught an older,
  slower response occasionally arriving after a newer one and briefly
  sizing the editor for the wrong cell.
- Crops are tracked by a stable per-photo id (assigned when a file is
  added), not by array position, specifically so dragging a cropped photo
  to a new slot doesn't leave the crop behind — verified with a test that
  drags a cropped photo and checks the crop followed it, not the position
  it vacated.

## API sketch

- `POST /api/photo` — multipart body: file + target (preset id or custom
  W×H) + fit mode + optional format/quality override + optional `crop`
  (JSON-encoded `CropSpec`, overriding the automatic fit) → streams the
  result image, sets no cookies, no session.
- `POST /api/gif` — same shape, Cover fit only, no manual crop (animated
  crop math isn't implemented — see *What it does*).
- `POST /api/collage` — multipart body: 2–9 files (any field name) + target
  + optional gutter/gutter color/allow-upscale + optional `crop_0`.."crop_8"
  (JSON-encoded `CropSpec` per file position) → streams the composed
  image. Fields and files can arrive in any order in the multipart stream;
  the route walks every part once rather than assuming an order.
- `GET /api/collage/layout` — query: photo count + target (+ optional
  gutter) → the same grid/cell math `POST /api/collage` uses internally,
  so the editor can size itself against a cell before any file is
  uploaded.
- `POST /api/generate/:style` — JSON body: seed, target, options → streams
  the result image.
- `GET /api/presets` — the curated preset list, for the frontend to render.

All processing endpoints are stateless: same input, same output, every
time (generators are seeded, not random-per-call).

## Deployment

```yaml
# docker-compose.yml (shape)
services:
  background-buster:
    build: .
    ports:
      - "8081:8081"
    tmpfs:
      - /tmp
    environment:
      - PORT=8081
      - MAX_UPLOAD_MB=25
    restart: unless-stopped
```

No auth by default — the intended perimeter is Tailscale itself (only
devices on your tailnet can reach `:8081` at all). An optional shared-
token header check is worth having behind an env var for the case where
the tailnet is shared more broadly than "just me," off by default.

## Limits & validation

- Upload size cap (`MAX_UPLOAD_MB` per file, default 25) enforced at the
  multipart parser level, not after buffering the whole file; a collage
  caps at 9 files, enforced by the same parser (`limits.files`), so the
  request body limit is sized for "9 files at the per-file cap," not
  unbounded.
- Format verified by sniffing file content (magic bytes) via `sharp`'s own
  decoder, not trusted from the client-supplied `Content-Type` or file
  extension.
- GIF frame-count ceiling to keep the resize pass bounded in time and
  memory.

## Testing & tooling

- TypeScript `strict` mode, ESLint + Prettier, both workspaces.
- Vitest for `pipeline/*` — pure functions, no server needed to test them.
- `server/test/server.test.ts` uses Fastify's own `inject()` for one thing
  a pure pipeline test structurally can't cover: whether an error thrown
  inside a route actually reaches the intended HTTP response shape. It
  exists because it caught a real bug — `app.setErrorHandler(...)`
  registered *after* `registerRoutes(app)` never applied to those routes at
  all (Fastify resolves a route's error handler from the encapsulation
  context live at the moment the route is registered, not looked up fresh
  per request), so every validation error in the app was silently
  returning a generic 500 instead of a proper 400. Fixed by registering the
  error handler first; the test stays as a regression guard against
  reintroducing that ordering mistake.
- The editor's interactive pieces (pan/zoom/rotate/flip, the layout-fetch
  race, crop identity surviving a reorder) were exercised with a real
  headless-Chromium script during development, not just read over — that
  process caught three real bugs unit tests couldn't have: the
  layout-request race above, the editor modal briefly rendering
  zero-sized because it was measured before its image finished loading,
  and a reordered photo's "Cropped" badge resetting to hidden because
  the list re-render rebuilt it from scratch instead of re-deriving it
  from the crop map. None of that harness is checked in — it's not part
  of the repo's own test suite — but the fixes and the reasoning behind
  them are.

## Open questions worth a quick pass before implementation

- **Visual direction** — confirm the darkroom/lightbox concept above
  actually reads as intended (a couple of rough mockups to look at) before
  committing to it in code.
- **Shared-token auth toggle** — worth building in v1, or add later if the
  tailnet setup ever needs it?
