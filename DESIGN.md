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
4. **GIF handling** — same fit modes, applied per-frame, with frame timing
   and loop count preserved and a proper two-pass palette so you don't get
   the washed-out/banded look naive GIF resizing produces.

Not in v1, deliberately: AI image generation (different tool, different
resource profile — see the earlier discussion of Fooocus/ComfyUI), user
accounts, a saved-history gallery, video/MP4 export, multi-monitor spanning.
These are plausible v2 candidates, not scope creep to half-build now.

## Ephemeral processing — how "doesn't store photos" is actually enforced

The upload handler never calls anything that writes to a path outside
`os.tmpdir()`/an in-memory `Buffer`. Concretely:

- Multipart uploads are parsed straight into memory (size-capped — see
  *Limits*), never `multer`'s disk storage.
- The **only** processing step that needs a real file is the GIF
  palette-based re-encode, because `ffmpeg` needs seekable file input/output.
  That step writes into a per-request temp directory created under a tmpfs
  mount (`/tmp` in the container, backed by `tmpfs` in `docker-compose.yml`
  so it never touches the host disk at all), and a `finally` block removes
  that directory unconditionally — request succeeds, fails, or the client
  disconnects mid-stream, cleanup still runs.
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
- **Saliency-aware cropping** for Cover mode: `sharp`'s entropy/attention
  crop strategy picks the region to keep instead of a blind center-crop.
  Cheap, no ML model to ship, and correct often enough to be the sane
  default; a manual "drag to reposition" override is available in the UI
  for the times it guesses wrong.
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
- **GIFs get a real two-pass encode**: `ffmpeg`'s `palettegen`/`paletteuse`
  filter pair per unique frame content, not "resize each frame and hope."
  Frame delays and loop count are read from the source and reapplied
  exactly; frames are only dropped if the output would otherwise exceed a
  sane size ceiling, and only after the user is told why.
- **Device-aware pixel density**: phone/TV presets carry both a logical
  resolution and (where relevant, e.g. Retina phone presets) an actual
  output pixel count, so "iPhone 15" doesn't quietly hand you a blurry
  under-sized file.

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
        photo/             upload -> orient -> fit -> effect -> encode
        gif/                same shape, ffmpeg-backed
        generators/         gradient, mesh, low-poly, plasma, solid — pure functions
        shared/             fit-mode math, color utils, preset resolution — reused by both
      presets/             device preset data + aspect-ratio matching
      config/              env-driven config, one module, validated at boot
      logging/             pino instance + redaction rules
    test/                  Vitest — pipeline modules are pure functions, tested without HTTP
  web/                     TypeScript + Vite, no UI framework
    src/
      components/          small, framework-free, hand-rolled (Web Components or plain DOM modules)
      canvas-preview/       live preview renderer
      styles/
  Dockerfile               multi-stage: build -> slim runtime (Alpine + libvips + ffmpeg), non-root user
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
  (`resolveFit(source, target, mode)`, `pickFormat(hasAlpha, isPhoto)`,
  `matchPresetsByAspect(w, h, presets)`). Both the photo pipeline and the
  generator pipeline call into it instead of duplicating fit-mode math.
- `pipeline/generators/*` each export a single `generate(seed, width,
  height, options) -> Buffer` function with the same signature, so adding
  a new style later is "write one new file," not "touch the router."
- `api/` routes do request validation and call one pipeline function each;
  no business logic lives in a route handler.

## API sketch

- `POST /api/photo` — multipart body: file + target (preset id or custom
  W×H) + fit mode + optional format/quality override → streams the result
  image, sets no cookies, no session.
- `POST /api/gif` — same shape, GIF-specific options (max size ceiling).
- `POST /api/generate/:style` — JSON body: seed, target, options → streams
  the result image.
- `GET /api/presets` — the curated preset list, for the frontend to render.

All three processing endpoints are stateless: same input, same output,
every time (generators are seeded, not random-per-call).

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

- Upload size cap (`MAX_UPLOAD_MB`, default 25) enforced at the multipart
  parser level, not after buffering the whole file.
- MIME type verified by sniffing file content (magic bytes), not trusted
  from the client-supplied `Content-Type` or file extension.
- GIF frame-count/dimension ceiling to keep the `ffmpeg` re-encode step
  bounded in time and memory.

## Testing & tooling

- TypeScript `strict` mode, ESLint + Prettier, both workspaces.
- Vitest for `pipeline/*` — pure functions, no server needed to test them.
- A couple of end-to-end smoke tests (supertest) covering the three
  endpoints with tiny fixture images.

## Open questions worth a quick pass before implementation

- **Visual direction** — confirm the darkroom/lightbox concept above
  actually reads as intended (a couple of rough mockups to look at) before
  committing to it in code.
- **Shared-token auth toggle** — worth building in v1, or add later if the
  tailnet setup ever needs it?
