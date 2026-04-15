<p align="center">
  <h1 align="center">PDFy</h1>
  <p align="center">
    <strong>A local PDF editor with no limits. No accounts. No uploads. No restrictions.</strong>
  </p>
  <p align="center">
    <a href="#features">Features</a> &nbsp;&bull;&nbsp;
    <a href="#installation">Installation</a> &nbsp;&bull;&nbsp;
    <a href="#usage">Usage</a> &nbsp;&bull;&nbsp;
    <a href="#build">Build</a> &nbsp;&bull;&nbsp;
    <a href="#tech-stack">Tech Stack</a>
  </p>
</p>

<br>

## Why PDFy?

Online PDF editors like Sejda, SmallPDF, and ILovePDF limit you to **3 tasks per hour** on free tiers. If you edit PDFs regularly throughout the day, you hit a wall fast.

**PDFy runs entirely on your machine.** No file uploads, no rate limits, no subscriptions. Open, edit, save — as many times as you want.

<br>

## Features

### Edit Existing Text
Click the edit tool, select any text block in the PDF, and modify it directly — change wording, font, size, color, bold, italic.

### Add New Text
Place new text anywhere on any page with full formatting control.

### Draw & Sign
Freehand drawing tool perfect for signatures, annotations, or quick marks.

### Highlight
Semi-transparent yellow highlighter — drag over content to emphasize it.

### Whiteout
Cover any content with a clean white rectangle. Redact or clean up mistakes.

### Shapes & Arrows
Rectangles, circles, lines, and arrows with customizable stroke, fill, and opacity.

### Insert Images
Drop in logos, photos, stamps, or scanned signatures (PNG, JPG, GIF, BMP, WebP).

### 65+ Fonts
Google Fonts loaded and organized by category — popular, sans-serif, serif, monospace, and decorative/handwriting.

### Multi-Page Navigation
Thumbnail sidebar, page input, prev/next buttons, scroll tracking.

### Undo / Redo
Full history with up to 50 steps. `Ctrl+Z` / `Ctrl+Y`.

### Drag & Drop
Drag a PDF file directly onto the app window to open it.

### Keyboard Shortcuts

| Key | Tool |
|-----|------|
| `V` | Select |
| `H` | Hand (pan) |
| `F` | Edit existing text |
| `T` | Add new text |
| `D` | Draw / Sign |
| `G` | Highlight |
| `E` | Eraser |
| `R` | Rectangle |
| `C` | Circle |
| `L` | Line |
| `A` | Arrow |
| `W` | Whiteout |
| `Ctrl+O` | Open PDF |
| `Ctrl+S` | Save |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl++` | Zoom in |
| `Ctrl+-` | Zoom out |

<br>

## Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or later)

### Setup

```bash
git clone https://github.com/ejmm19/PDFy.git
cd PDFy
npm install
npm start
```

That's it.

<br>

## Usage

1. **Open a PDF** — click "Abrir PDF" or drag a file onto the window
2. **Pick a tool** from the toolbar or use a keyboard shortcut
3. **Edit** — add text, draw, highlight, insert images, modify existing text
4. **Save** — `Ctrl+S` to save, or `Ctrl+Shift+S` for "Save as..."

<br>

## Build

Generate a standalone executable — no Node.js required to run it.

```bash
# Windows (portable .exe)
npm run build:win

# macOS (.dmg)
npm run build:mac

# Linux (.AppImage / .deb)
npm run build:linux
```

Output goes to the `dist/` folder.

<br>

## Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Desktop shell | [Electron](https://www.electronjs.org/) | Cross-platform native app |
| PDF rendering | [PDF.js](https://mozilla.github.io/pdf.js/) | Mozilla's PDF viewer engine |
| Canvas editing | [Fabric.js](http://fabricjs.com/) | Interactive object manipulation |
| PDF export | [pdf-lib](https://pdf-lib.js.org/) | Write annotations back to PDF |
| Bundler | [esbuild](https://esbuild.github.io/) | Fast JS bundling |
| Design | Uber-inspired | Black & white, pill buttons, clean typography |

<br>

## Project Structure

```
PDFy/
├── main.js            # Electron main process
├── preload.js         # Context bridge (IPC)
├── package.json
├── src/
│   ├── index.html     # App layout & toolbar
│   ├── styles.css     # Uber-inspired design system
│   └── renderer.js    # PDF engine, tools, canvas, export
└── dist/              # Build output (gitignored)
```

<br>

## License

MIT

<br>

---

<p align="center">
  Built because online PDF editors kept saying <em>"You've reached your limit."</em>
</p>
