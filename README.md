<div align="center">

# PrezEn

*Build, present and share presentations in your browser. No account. One file. Works offline.*

[Open the app](https://valkea.github.io/Prezen/) · download `PrezEn.html` from the site and it runs from any folder or flashdrive

</div>

## Why PrezEn

- 🙈 **No account, no server.** Everything runs in the browser. Work is saved automatically in this
  browser (IndexedDB) and in the files you export.
- 🔗 **The link is the file.** Like [Dedal](https://github.com/Valkea/dedal), the whole presentation is
  compressed into the part of the link after `#`, which browsers never send to a server.
  Add `&play` to the link to open it straight as a slideshow.
- 📦 **One HTML file does everything.** The app is a single self-contained HTML file. Copy it to a
  flashdrive, double-click it on Linux, Windows or macOS, and edit or present with no install and no network.
- 🎬 **Transitions and animations.** 27 slide transitions (fade, push, cube, flip, dive, iris, wipes…),
  32 element effects (entrance, emphasis, exit), and a **Studio** to design your own with keyframes.
- 🖨️ **PDF export** through the browser's print engine: vector text, one page per slide, or an A4 handout
  with speaker notes.

## Using it

| You want to… | Do this |
| --- | --- |
| Edit online | Open the app. Your decks appear in **My presentations** (this browser only). |
| Share without an account | **Share** → copy the link. Anyone opening it gets their own copy. |
| Present anywhere, light file | **Export → Slideshow (HTML)**: one file with the deck and the player only (~120 KB + images). |
| Edit from a flashdrive | **Export → Editable presentation (HTML)**, or **Ctrl+S**. Open it from the drive, edit, **Ctrl+S** again. In Chrome/Edge the file is overwritten in place (pick the same file once); other browsers download an updated copy. |
| Print / PDF | **Ctrl+P** or **Export → PDF**, then *Save as PDF* in the print dialog. |
| Keep the raw data | **Export → Data (JSON)**. The app opens `.json` and exported `.html` files (menu, or drop them on the canvas). |

### Pictures

Pick from the **Image** dialog (or paste / drop onto the slide):

| Source | Example | Notes |
| --- | --- | --- |
| Upload | any file | Embedded in the deck (optionally shrunk to 2400 px). Works offline everywhere. |
| Web link | `https://…/photo.jpg` | Loaded from the web when shown. |
| Google Drive | `https://drive.google.com/file/d/…/view` | Share it as “Anyone with the link”. Rewritten to a direct image link. |
| Amazon S3 | `s3://bucket/key` or an `https://…amazonaws.com/…` / pre-signed URL | Public objects, or pre-signed URLs (they expire). Also `gs://bucket/key` and Dropbox links. |
| Local path | `images/photo.jpg` | Relative to the presentation file: keep the pictures next to the `.html` (e.g. on the flashdrive). |

On export, **Embed linked images** downloads linked pictures into the file when the host allows it (CORS),
so the slideshow also works offline.

### Presenting

<kbd>→</kbd> <kbd>Space</kbd> <kbd>PgDn</kbd> next (clickers work) · <kbd>←</kbd> previous · <kbd>O</kbd> overview ·
<kbd>S</kbd> presenter window (notes, next slide, timer) · <kbd>B</kbd>/<kbd>W</kbd> black/white screen ·
<kbd>F</kbd> full screen · <kbd>3</kbd><kbd>Enter</kbd> go to slide 3 · swipe on touch screens · <kbd>Esc</kbd> exit.

Press <kbd>?</kbd> in the editor for every shortcut.

## Develop

No framework and no npm dependency: plain JavaScript (classic scripts, so the app also runs from
`file://`), CSS and two tiny Node scripts. Node ≥ 20 is only needed to build and test.

```bash
npm run dev        # static server → http://localhost:5173 (sources) and /dist/ (built file)
npm test           # unit tests (node --test) + build check
npm run build      # dist/index.html and dist/PrezEn.html (identical single files)
```

Every push to `main` runs the tests, builds, and deploys `dist/` to GitHub Pages
(`.github/workflows/pages.yml`; enable *Settings → Pages → Source: GitHub Actions* once).
If the repository is not `Valkea/Prezen`, update `PZ.PUBLIC_URL` in `src/js/core.js`: share links
created from a local file point there.

### How it fits together

| File | Role |
| --- | --- |
| `src/js/core.js` | Namespace `PZ`, DOM helper, utilities |
| `src/js/sanitize.js` | Allow-list sanitizers for rich text and SVG (links carry whole decks: they are untrusted) |
| `src/js/model.js` | Document format, defaults, validation (`normalizeDoc`), layouts, fonts |
| `src/js/assets.js` | Image references: embedded assets, Drive / S3 / Dropbox / relative paths |
| `src/js/shapes.js`, `icons.js` | Vector shapes and the built-in icon set |
| `src/js/effects.js` | Effect library and the keyframe engine (Web Animations API) |
| `src/js/render.js` | Slide → DOM, shared by editor, player, thumbnails and print |
| `src/js/player.js`, `print.js` | Slideshow (+ presenter view) and PDF |
| `src/js/codec.js` | Share links: JSON → deflate (`CompressionStream`) → base64url |
| `src/js/storage.js`, `export.js` | Browser library, file open/save, self-contained HTML export |
| `src/js/editor/*` | Editor UI: stage, panels, dialogs, Studio, welcome deck |
| `src/js/boot.js` | Chooses what to open (link, embedded data, last deck) |

Scripts and styles marked `data-pz` in `index.html` are the app; those also marked `data-player` make up the
light slideshow export. An exported file rebuilds itself from these inline nodes (TiddlyWiki-style), so an
editable file can export and save new files with no network.

### Document format

```jsonc
{
  "v": 1, "id": "…", "title": "…", "w": 1920, "h": 1080,
  "theme": { "font": "Inter", "color": "#1d2433", "accent": "#5b5bf0", "accent2": "#ff6b6b", "bg": "#ffffff" },
  "slides": [{
    "id": "…", "bg": { "type": "color|gradient|image", "color": "#fff", "color2": "…", "angle": 135, "src": "…" },
    "transition": { "effect": "cube-left", "duration": 1000, "easing": "" },
    "auto": 0, "hidden": false, "notes": "…",
    "els": [{ "type": "text|image|shape|icon", "x": 0, "y": 0, "w": 400, "h": 200, "rot": 0, "opacity": 1,
              "anim": { "effect": "rise", "trigger": "click|with|after", "duration": 600, "delay": 0, "order": 1 }, "…": "…" }]
  }],
  "effects": { "custom-…": { "kind": "transition", "in": [{ "x": 100 }, {}], "out": [{}, { "x": -100 }], "inTop": true } },
  "assets": { "a…": "data:image/webp;base64,…" }
}
```

Keyframes use `opacity`, `x` / `y` (percent of the slide), `scale`, `rotate`, `rotateX`, `rotateY`, `blur`
and `clip` (`inset()`, `circle()`, `ellipse()`, `polygon()`), with optional `offset` and `easing`.

## Privacy

Only these requests leave the device: pictures you link to, Google Fonts when a slide uses one (system
fonts never load anything; fonts can be embedded on export), and the online icon search (Iconify) when you
use it. Nothing else: no analytics, no cookies.

## Roadmap ideas

- Optional tiny server with simple accounts to store and list share links across devices.
- Canvas mode (Prezi-style zooming between slides placed on a large map).
- Grouping, tables and charts, image cropping, more layouts and themes.
