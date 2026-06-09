# Foto-Bereinigung Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based PWA that scans multiple local photo folders, removes duplicates in two phases (SHA-256 exact + dHash perceptual), and copies unique photos to a date-sorted target folder.

**Architecture:** Vanilla JS + Vite 8. Heavy processing (hashing, dedup) runs in a Web Worker so the UI stays responsive. Main thread handles File System Access API and file copying. Pure hash functions are extracted to `src/hash-utils.js` so they can be unit-tested in Node without browser APIs.

**Tech Stack:** Vite 8, Vanilla JS (ES modules), exifr (EXIF parsing), vitest (unit tests), vite-plugin-pwa (service worker + offline cache)

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/main.js` | UI orchestration: screen switching, File System Access API calls, worker communication |
| `src/filesystem.js` | Wrap `showDirectoryPicker()`, recursive directory traversal, image file filtering |
| `src/exif.js` | Date extraction: EXIF → filename patterns → `lastModified` → null |
| `src/hash-utils.js` | Pure functions: dHash, Hamming distance — no browser APIs, fully testable |
| `src/worker.js` | Web Worker: Phase 1 SHA-256 exact dedup, Phase 2 dHash perceptual dedup |
| `src/organizer.js` | Build target path (YYYY/YYYY-MM/), handle filename conflicts, copy files |
| `src/style.css` | All CSS for three screens |
| `tests/exif.test.js` | Unit tests: filename date parsing, `dateToParts` |
| `tests/hash-utils.test.js` | Unit tests: `hammingDistance`, `dhash` |
| `tests/organizer.test.js` | Unit tests: `buildTargetPath`, `resolveConflict` |
| `public/` | Static assets (manifest.json already present) |
| `vite.config.js` | Extend with Vitest config + vite-plugin-pwa |

---

## Task 1: Vitest + vite-plugin-pwa setup

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`

- [ ] **Step 1.1: Install dev dependencies**

```bash
npm install -D vitest vite-plugin-pwa
```

- [ ] **Step 1.2: Update vite.config.js**

```js
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/duplicate-finder/',
  build: { target: 'es2022' },
  worker: { format: 'es' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // use existing public/manifest.json
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
})
```

- [ ] **Step 1.3: Add test script to package.json**

Add under `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 1.4: Verify build still works**

```bash
npm run build
```

Expected: `✓ built in <Xs>` with no errors.

- [ ] **Step 1.5: Write a smoke test to verify Vitest works**

Create `tests/smoke.test.js`:
```js
import { describe, it, expect } from 'vitest'

describe('vitest', () => {
  it('works', () => expect(1 + 1).toBe(2))
})
```

- [ ] **Step 1.6: Run tests**

```bash
npm test
```

Expected: `1 passed`

- [ ] **Step 1.7: Commit**

```bash
git add package.json package-lock.json vite.config.js tests/smoke.test.js
git commit -m "chore: add vitest + vite-plugin-pwa"
```

---

## Task 2: CSS — all three screens

**Files:**
- Modify: `src/style.css`

- [ ] **Step 2.1: Replace style.css with full implementation**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0d1117;
  --surface: #161b22;
  --border: #30363d;
  --text: #e2e8f0;
  --muted: #64748b;
  --accent: #64ffda;
  --green: #4ade80;
  --blue: #3b82f6;
  --red: #f87171;
  --orange: #fb923c;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 32px 16px;
}

.app { width: 100%; max-width: 520px; }

/* Header */
.app-header { margin-bottom: 28px; }
.app-header h1 { font-size: 20px; font-weight: 600; color: var(--accent); }
.app-header p  { font-size: 13px; color: var(--muted); margin-top: 2px; }

/* Screen visibility */
.screen { display: none; }
.screen.active { display: block; }

/* Card */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 14px;
}
.card-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin-bottom: 8px;
}

/* Folder list */
.folder-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
.folder-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  color: var(--text);
}
.folder-item button {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 16px;
  padding: 0 2px;
}
.folder-item button:hover { color: var(--red); }

/* Buttons */
.btn {
  width: 100%;
  padding: 11px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-primary  { background: #166534; color: #bbf7d0; }
.btn-primary:hover:not(:disabled)  { opacity: 0.85; }
.btn-secondary { background: var(--surface); border: 1px solid var(--border); color: var(--muted); }
.btn-add {
  background: none;
  border: 1px dashed var(--border);
  border-radius: 6px;
  color: var(--muted);
  font-size: 13px;
  padding: 7px;
  cursor: pointer;
  width: 100%;
  text-align: center;
}
.btn-add:hover { border-color: var(--accent); color: var(--accent); }

/* Mode toggle */
.mode-toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.mode-btn {
  background: var(--bg);
  border: 2px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s;
}
.mode-btn.selected { border-color: var(--blue); background: #1a2744; }
.mode-btn .mode-title { font-size: 13px; color: var(--text); font-weight: 500; }
.mode-btn .mode-sub   { font-size: 11px; color: var(--muted); margin-top: 2px; }

/* Progress screen */
.progress-item { margin-bottom: 14px; }
.progress-header {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 5px;
}
.progress-header .done { color: var(--green); }
.progress-bar { background: var(--bg); border-radius: 4px; height: 6px; }
.progress-fill { height: 6px; border-radius: 4px; transition: width 0.3s; }
.progress-fill.green { background: var(--green); }
.progress-fill.blue  { background: var(--blue); }

/* Stats grid */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  text-align: center;
  padding: 4px;
}
.stat-value { font-size: 26px; font-weight: 700; }
.stat-label { font-size: 11px; color: var(--muted); margin-top: 2px; }
.stat-value.green  { color: var(--green); }
.stat-value.blue   { color: var(--blue); }
.stat-value.red    { color: var(--red); }
.stat-value.orange { color: var(--orange); }

/* Folder tree preview */
.folder-tree {
  font-family: monospace;
  font-size: 12px;
  color: var(--text);
  line-height: 1.8;
}

/* ETA */
.eta { text-align: center; font-size: 12px; color: var(--muted); margin-top: 12px; }
```

- [ ] **Step 2.2: Commit**

```bash
git add src/style.css
git commit -m "feat: complete CSS for all three screens"
```

---

## Task 3: filesystem.js — directory picking & file collection

**Files:**
- Create: `src/filesystem.js`

- [ ] **Step 3.1: Write failing test for `isImageFile`**

Create `tests/filesystem.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { isImageFile } from '../src/filesystem.js'

describe('isImageFile', () => {
  it('accepts jpg', () => expect(isImageFile('photo.jpg')).toBe(true))
  it('accepts jpeg', () => expect(isImageFile('photo.JPEG')).toBe(true))
  it('accepts png', () => expect(isImageFile('img.PNG')).toBe(true))
  it('accepts heic', () => expect(isImageFile('IMG_001.HEIC')).toBe(true))
  it('rejects txt', () => expect(isImageFile('notes.txt')).toBe(false))
  it('rejects no extension', () => expect(isImageFile('photo')).toBe(false))
})
```

- [ ] **Step 3.2: Run test — expect failure**

```bash
npm test tests/filesystem.test.js
```

Expected: FAIL — `isImageFile is not a function`

- [ ] **Step 3.3: Implement filesystem.js**

```js
const IMAGE_EXTENSIONS = new Set([
  'jpg','jpeg','png','gif','webp','heic','heif',
  'tiff','tif','bmp','avif','cr2','nef','arw',
])

export function isImageFile(filename) {
  const ext = filename.split('.').pop()?.toLowerCase()
  return ext ? IMAGE_EXTENSIONS.has(ext) : false
}

export async function pickSourceFolders(existing = []) {
  const handle = await window.showDirectoryPicker({ mode: 'read' })
  return [...existing, handle]
}

export async function pickTargetFolder() {
  return window.showDirectoryPicker({ mode: 'readwrite' })
}

export async function collectImageFiles(dirHandles) {
  const files = []
  for (const dirHandle of dirHandles) {
    await collectFromDir(dirHandle, files)
  }
  return files
}

async function collectFromDir(dirHandle, files) {
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'file' && isImageFile(name)) {
      files.push(handle)
    } else if (handle.kind === 'directory') {
      await collectFromDir(handle, files)
    }
  }
}
```

- [ ] **Step 3.4: Run tests — expect pass**

```bash
npm test tests/filesystem.test.js
```

Expected: 6 passed

- [ ] **Step 3.5: Commit**

```bash
git add src/filesystem.js tests/filesystem.test.js
git commit -m "feat: filesystem.js with image file collection"
```

---

## Task 4: exif.js — date extraction

**Files:**
- Create: `src/exif.js`
- Create: `tests/exif.test.js`

- [ ] **Step 4.1: Write failing tests**

Create `tests/exif.test.js`:
```js
import { describe, it, expect, vi } from 'vitest'
import { dateToParts, extractDateFromFilename } from '../src/exif.js'

describe('dateToParts', () => {
  it('returns Kein-Datum for null', () => {
    expect(dateToParts(null)).toEqual({ year: 'Kein-Datum', month: null })
  })
  it('formats year and month correctly', () => {
    expect(dateToParts(new Date('2023-06-15'))).toEqual({ year: '2023', month: '2023-06' })
  })
  it('pads single-digit month', () => {
    expect(dateToParts(new Date('2023-01-01'))).toEqual({ year: '2023', month: '2023-01' })
  })
})

describe('extractDateFromFilename', () => {
  it('parses ISO format 2023-06-15', () => {
    const d = extractDateFromFilename('2023-06-15_vacation.jpg')
    expect(d?.getFullYear()).toBe(2023)
    expect(d?.getMonth()).toBe(5) // 0-indexed
    expect(d?.getDate()).toBe(15)
  })
  it('parses compact format IMG_20230615_143022.jpg', () => {
    const d = extractDateFromFilename('IMG_20230615_143022.jpg')
    expect(d?.getFullYear()).toBe(2023)
    expect(d?.getMonth()).toBe(5)
    expect(d?.getDate()).toBe(15)
  })
  it('returns null for unrecognised filename', () => {
    expect(extractDateFromFilename('vacation.jpg')).toBeNull()
  })
  it('returns null for invalid date 20239915', () => {
    expect(extractDateFromFilename('IMG_20239915_001.jpg')).toBeNull()
  })
})
```

- [ ] **Step 4.2: Run tests — expect failure**

```bash
npm test tests/exif.test.js
```

Expected: FAIL

- [ ] **Step 4.3: Implement exif.js**

```js
import { parse as parseExif } from 'exifr'

const FILENAME_PATTERNS = [
  /(\d{4})-(\d{2})-(\d{2})/,          // 2023-06-15
  /(\d{4})_(\d{2})_(\d{2})/,          // 2023_06_15
  /[^\d](\d{4})(\d{2})(\d{2})[^\d]/,  // IMG_20230615_ (with boundaries)
  /^(\d{4})(\d{2})(\d{2})/,           // 20230615_...
]

export function extractDateFromFilename(filename) {
  for (const pattern of FILENAME_PATTERNS) {
    const m = filename.match(pattern)
    if (!m) continue
    const [, y, mo, d] = m
    const year = Number(y), month = Number(mo) - 1, day = Number(d)
    if (month < 0 || month > 11 || day < 1 || day > 31) continue
    const date = new Date(year, month, day)
    if (isNaN(date.getTime())) continue
    return date
  }
  return null
}

export function dateToParts(date) {
  if (!date) return { year: 'Kein-Datum', month: null }
  const year = date.getFullYear().toString()
  const month = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`
  return { year, month }
}

export async function extractDate(file) {
  // 1. EXIF
  try {
    const exif = await parseExif(file, { pick: ['DateTimeOriginal', 'DateTime'] })
    if (exif?.DateTimeOriginal) return new Date(exif.DateTimeOriginal)
    if (exif?.DateTime) return new Date(exif.DateTime)
  } catch { /* unreadable EXIF — continue */ }

  // 2. Filename
  const fromName = extractDateFromFilename(file.name)
  if (fromName) return fromName

  // 3. lastModified
  if (file.lastModified) return new Date(file.lastModified)

  return null
}
```

- [ ] **Step 4.4: Run tests — expect pass**

```bash
npm test tests/exif.test.js
```

Expected: all passed

- [ ] **Step 4.5: Commit**

```bash
git add src/exif.js tests/exif.test.js
git commit -m "feat: exif.js with date extraction and filename parsing"
```

---

## Task 5: hash-utils.js — pure hash functions

**Files:**
- Create: `src/hash-utils.js`
- Create: `tests/hash-utils.test.js`

- [ ] **Step 5.1: Write failing tests**

Create `tests/hash-utils.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { hammingDistance, dhash } from '../src/hash-utils.js'

describe('hammingDistance', () => {
  it('identical arrays → 0', () => {
    expect(hammingDistance(new Uint8Array([0, 0]), new Uint8Array([0, 0]))).toBe(0)
  })
  it('single byte fully flipped → 8', () => {
    expect(hammingDistance(new Uint8Array([0xFF, 0]), new Uint8Array([0, 0]))).toBe(8)
  })
  it('single bit difference → 1', () => {
    expect(hammingDistance(new Uint8Array([0b00000001]), new Uint8Array([0b00000000]))).toBe(1)
  })
})

describe('dhash', () => {
  it('returns 8-byte Uint8Array', () => {
    // Create a 9x8 gradient image (pixel values increasing left to right)
    const pixels = new Uint8ClampedArray(9 * 8 * 4)
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 9; col++) {
        const i = (row * 9 + col) * 4
        const v = col * 28 // increasing brightness left to right
        pixels[i] = v; pixels[i+1] = v; pixels[i+2] = v; pixels[i+3] = 255
      }
    }
    const hash = dhash(pixels)
    expect(hash).toBeInstanceOf(Uint8Array)
    expect(hash.length).toBe(8)
    // All bits set: left pixel always brighter → all 1s
    expect(Array.from(hash).every(b => b === 0xFF)).toBe(true)
  })
})
```

- [ ] **Step 5.2: Run tests — expect failure**

```bash
npm test tests/hash-utils.test.js
```

Expected: FAIL

- [ ] **Step 5.3: Implement hash-utils.js**

```js
/**
 * Difference hash (dHash) for an 9×8 pixel image.
 * Input: Uint8ClampedArray of RGBA pixels (9*8*4 bytes)
 * Output: 8-byte Uint8Array (64-bit hash)
 */
export function dhash(pixels) {
  const hash = new Uint8Array(8)
  let bit = 0
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const i1 = (row * 9 + col) * 4
      const i2 = (row * 9 + col + 1) * 4
      const g1 = pixels[i1] * 0.299 + pixels[i1+1] * 0.587 + pixels[i1+2] * 0.114
      const g2 = pixels[i2] * 0.299 + pixels[i2+1] * 0.587 + pixels[i2+2] * 0.114
      if (g1 > g2) hash[bit >> 3] |= (1 << (bit & 7))
      bit++
    }
  }
  return hash
}

/**
 * Hamming distance between two equal-length Uint8Arrays.
 */
export function hammingDistance(a, b) {
  let dist = 0
  for (let i = 0; i < a.length; i++) {
    let xor = a[i] ^ b[i]
    while (xor) { dist += xor & 1; xor >>>= 1 }
  }
  return dist
}
```

- [ ] **Step 5.4: Run tests — expect pass**

```bash
npm test tests/hash-utils.test.js
```

Expected: all passed

- [ ] **Step 5.5: Commit**

```bash
git add src/hash-utils.js tests/hash-utils.test.js
git commit -m "feat: hash-utils.js — dhash and hamming distance"
```

---

## Task 6: organizer.js — target path building & file copying

**Files:**
- Create: `src/organizer.js`
- Create: `tests/organizer.test.js`

- [ ] **Step 6.1: Write failing tests**

Create `tests/organizer.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { buildTargetPath, resolveConflict } from '../src/organizer.js'

describe('buildTargetPath', () => {
  it('dated file → YYYY/YYYY-MM/filename', () => {
    expect(buildTargetPath('IMG_001.jpg', { year: '2023', month: '2023-06' }))
      .toBe('2023/2023-06/IMG_001.jpg')
  })
  it('undated file → Kein-Datum/filename', () => {
    expect(buildTargetPath('photo.jpg', { year: 'Kein-Datum', month: null }))
      .toBe('Kein-Datum/photo.jpg')
  })
})

describe('resolveConflict', () => {
  it('no conflict → original name', () => {
    expect(resolveConflict('photo.jpg', new Set())).toBe('photo.jpg')
  })
  it('conflict → appends _2', () => {
    expect(resolveConflict('photo.jpg', new Set(['photo.jpg']))).toBe('photo_2.jpg')
  })
  it('double conflict → appends _3', () => {
    expect(resolveConflict('photo.jpg', new Set(['photo.jpg', 'photo_2.jpg']))).toBe('photo_3.jpg')
  })
  it('file without extension', () => {
    expect(resolveConflict('photo', new Set(['photo']))).toBe('photo_2')
  })
})
```

- [ ] **Step 6.2: Run tests — expect failure**

```bash
npm test tests/organizer.test.js
```

Expected: FAIL

- [ ] **Step 6.3: Implement organizer.js**

```js
import { extractDate, dateToParts } from './exif.js'

export function buildTargetPath(filename, parts) {
  if (parts.year === 'Kein-Datum') return `Kein-Datum/${filename}`
  return `${parts.year}/${parts.month}/${filename}`
}

export function resolveConflict(filename, usedNames) {
  if (!usedNames.has(filename)) return filename
  const dotIdx = filename.lastIndexOf('.')
  const base = dotIdx >= 0 ? filename.slice(0, dotIdx) : filename
  const ext  = dotIdx >= 0 ? filename.slice(dotIdx) : ''
  let n = 2
  while (usedNames.has(`${base}_${n}${ext}`)) n++
  return `${base}_${n}${ext}`
}

export async function copyUniqueFiles(fileHandles, targetHandle, onProgress) {
  const usedNames = new Map() // path prefix → Set of used filenames
  let copied = 0

  for (const handle of fileHandles) {
    const file = await handle.getFile()
    const date = await extractDate(file)
    const parts = dateToParts(date)
    const dirPath = parts.year === 'Kein-Datum'
      ? 'Kein-Datum'
      : `${parts.year}/${parts.month}`

    if (!usedNames.has(dirPath)) usedNames.set(dirPath, new Set())
    const used = usedNames.get(dirPath)
    const safeName = resolveConflict(file.name, used)
    used.add(safeName)

    const dirHandle = await mkdirp(targetHandle, dirPath)
    const fileHandle = await dirHandle.getFileHandle(safeName, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(await file.arrayBuffer())
    await writable.close()

    copied++
    onProgress?.(copied, fileHandles.length)
  }
}

async function mkdirp(root, path) {
  let current = root
  for (const part of path.split('/')) {
    current = await current.getDirectoryHandle(part, { create: true })
  }
  return current
}
```

- [ ] **Step 6.4: Run tests — expect pass**

```bash
npm test tests/organizer.test.js
```

Expected: all passed

- [ ] **Step 6.5: Run full test suite**

```bash
npm test
```

Expected: all tests pass across all test files

- [ ] **Step 6.6: Commit**

```bash
git add src/organizer.js tests/organizer.test.js
git commit -m "feat: organizer.js — target path building and file copy"
```

---

## Task 7: worker.js — Phase 1 + Phase 2

**Files:**
- Create: `src/worker.js`

The worker communicates via `postMessage`. It does NOT have access to the File System Access API write operations — it only reads files and computes hashes. Results are sent back to the main thread.

**Message protocol:**

Inbound (main → worker):
```js
{ type: 'start', handles: FileSystemFileHandle[], mode: 'exact' | 'both' }
```

Outbound (worker → main):
```js
{ type: 'phase1-progress', current: number, total: number, exactDuplicates: number }
{ type: 'phase2-progress', current: number, total: number, similarDuplicates: number }
{ type: 'done', uniqueHandles: FileSystemFileHandle[], stats: { scanned, exact, similar } }
{ type: 'error', message: string }
```

- [ ] **Step 7.1: Implement worker.js**

Create `src/worker.js`:
```js
import { dhash, hammingDistance } from './hash-utils.js'

const HAMMING_THRESHOLD = 10

self.onmessage = async ({ data }) => {
  const { type, handles, mode } = data
  if (type !== 'start') return

  try {
    // Phase 1: exact dedup via SHA-256
    const { unique: afterPhase1, exactCount } = await phase1(handles)

    if (mode === 'exact') {
      self.postMessage({ type: 'done', uniqueHandles: afterPhase1,
        stats: { scanned: handles.length, exact: exactCount, similar: 0 } })
      return
    }

    // Phase 2: perceptual dedup via dHash
    const { unique: afterPhase2, similarCount } = await phase2(afterPhase1)

    self.postMessage({ type: 'done', uniqueHandles: afterPhase2,
      stats: { scanned: handles.length, exact: exactCount, similar: similarCount } })
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message })
  }
}

async function phase1(handles) {
  const seen = new Map() // hex hash → FileSystemFileHandle
  let exactCount = 0

  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i]
    const file = await handle.getFile()
    const buf = await file.arrayBuffer()
    const hashBuf = await crypto.subtle.digest('SHA-256', buf)
    const hex = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0')).join('')

    if (seen.has(hex)) {
      exactCount++
    } else {
      seen.set(hex, handle)
    }

    if (i % 50 === 0) {
      self.postMessage({ type: 'phase1-progress', current: i + 1,
        total: handles.length, exactDuplicates: exactCount })
    }
  }

  return { unique: Array.from(seen.values()), exactCount }
}

async function phase2(handles) {
  // Group by month to limit O(n²) comparisons
  const groups = new Map() // 'YYYY-MM' → [{ handle, hash }]
  const canvas = new OffscreenCanvas(9, 8)
  const ctx = canvas.getContext('2d')

  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i]
    const file = await handle.getFile()
    const month = getMonthKey(file)

    const bitmap = await createImageBitmap(file)
    ctx.drawImage(bitmap, 0, 0, 9, 8)
    bitmap.close()
    const { data } = ctx.getImageData(0, 0, 9, 8)
    const hash = dhash(data)

    if (!groups.has(month)) groups.set(month, [])
    groups.get(month).push({ handle, hash })

    if (i % 20 === 0) {
      self.postMessage({ type: 'phase2-progress', current: i + 1,
        total: handles.length, similarDuplicates: 0 })
    }
  }

  // Within each month group, mark duplicates
  const unique = []
  let similarCount = 0

  for (const group of groups.values()) {
    const keep = dedupGroup(group)
    similarCount += group.length - keep.length
    unique.push(...keep.map(e => e.handle))
  }

  self.postMessage({ type: 'phase2-progress', current: handles.length,
    total: handles.length, similarDuplicates: similarCount })

  return { unique, similarCount }
}

function dedupGroup(entries) {
  const kept = []
  for (const entry of entries) {
    const isDup = kept.some(k => hammingDistance(k.hash, entry.hash) < HAMMING_THRESHOLD)
    if (!isDup) kept.push(entry)
  }
  return kept
}

function getMonthKey(file) {
  const d = new Date(file.lastModified)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
```

- [ ] **Step 7.2: Verify build compiles without errors**

```bash
npm run build 2>&1 | grep -E "(error|warning|✓)"
```

Expected: `✓ built in <Xs>` with no errors.

- [ ] **Step 7.3: Commit**

```bash
git add src/worker.js
git commit -m "feat: worker.js — phase 1 SHA-256 exact + phase 2 dHash perceptual dedup"
```

---

## Task 8: main.js — full UI wiring

**Files:**
- Modify: `src/main.js`
- Modify: `index.html`

- [ ] **Step 8.1: Update index.html with full screen structure**

Replace the contents of `index.html`:
```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="manifest" href="/duplicate-finder/manifest.json" />
    <title>Foto-Bereinigung</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <div class="app">
      <div class="app-header">
        <h1>📷 Foto-Bereinigung</h1>
        <p>Duplikate entfernen &amp; Fotos nach Datum sortieren</p>
      </div>

      <!-- Screen 1: Setup -->
      <div id="screen-setup" class="screen active">
        <div class="card">
          <div class="card-label">Quell-Ordner (mehrere möglich)</div>
          <div id="source-list" class="folder-list"></div>
          <button id="btn-add-source" class="btn-add">+ Ordner hinzufügen</button>
        </div>

        <div class="card">
          <div class="card-label">Ziel-Ordner (bereinigt)</div>
          <div id="target-display" class="folder-item" style="cursor:pointer">
            <span id="target-name" style="color:var(--muted)">Noch kein Ordner gewählt</span>
            <span style="color:var(--muted)">wählen</span>
          </div>
        </div>

        <div class="card">
          <div class="card-label">Ähnlichkeitserkennung</div>
          <div class="mode-toggle">
            <div class="mode-btn" data-mode="exact">
              <div class="mode-title">Nur exakte</div>
              <div class="mode-sub">schnell (~30s)</div>
            </div>
            <div class="mode-btn selected" data-mode="both">
              <div class="mode-title">Exakt + Ähnliche</div>
              <div class="mode-sub">gründlich (~10 Min)</div>
            </div>
          </div>
        </div>

        <button id="btn-start" class="btn btn-primary" disabled>🔍 Scan starten</button>
      </div>

      <!-- Screen 2: Processing -->
      <div id="screen-processing" class="screen">
        <div class="card">
          <div class="progress-item">
            <div class="progress-header">
              <span>Phase 1: Exakte Duplikate</span>
              <span id="p1-status">0 / 0</span>
            </div>
            <div class="progress-bar"><div id="p1-fill" class="progress-fill green" style="width:0%"></div></div>
          </div>
          <div class="progress-item" id="p2-row" style="display:none">
            <div class="progress-header">
              <span>Phase 2: Ähnliche Bilder</span>
              <span id="p2-status">0 / 0</span>
            </div>
            <div class="progress-bar"><div id="p2-fill" class="progress-fill blue" style="width:0%"></div></div>
          </div>
        </div>

        <div class="card">
          <div class="stats-grid">
            <div><div id="stat-exact" class="stat-value green">0</div><div class="stat-label">exakte Duplikate</div></div>
            <div><div id="stat-similar" class="stat-value blue">0</div><div class="stat-label">ähnliche Bilder</div></div>
          </div>
        </div>

        <div class="eta" id="eta-text">Bitte warten...</div>
      </div>

      <!-- Screen 3: Results -->
      <div id="screen-results" class="screen">
        <div class="card">
          <div class="stats-grid">
            <div><div id="res-scanned" class="stat-value">0</div><div class="stat-label">gescannt</div></div>
            <div><div id="res-unique" class="stat-value green">0</div><div class="stat-label">einzigartig</div></div>
            <div><div id="res-exact" class="stat-value red">0</div><div class="stat-label">exakte Dups.</div></div>
            <div><div id="res-similar" class="stat-value orange">0</div><div class="stat-label">ähnliche Dups.</div></div>
          </div>
        </div>

        <div class="card">
          <div class="card-label">Ziel-Struktur</div>
          <div id="folder-preview" class="folder-tree"></div>
        </div>

        <button id="btn-copy" class="btn btn-primary">📋 Fotos in Ziel-Ordner kopieren</button>
        <div class="card" id="copy-progress-card" style="display:none;margin-top:14px">
          <div class="progress-item">
            <div class="progress-header"><span>Kopiere...</span><span id="copy-status">0 / 0</span></div>
            <div class="progress-bar"><div id="copy-fill" class="progress-fill green" style="width:0%"></div></div>
          </div>
        </div>
        <button id="btn-restart" class="btn btn-secondary" style="margin-top:10px">Neu starten</button>
      </div>
    </div>

    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 8.2: Implement main.js**

Replace `src/main.js`:
```js
import { pickSourceFolders, pickTargetFolder, collectImageFiles } from './filesystem.js'
import { copyUniqueFiles } from './organizer.js'

// State
let sourceHandles = []
let targetHandle = null
let selectedMode = 'both'
let uniqueHandles = []
let scanStats = {}

// DOM refs
const $ = id => document.getElementById(id)

// Screen management
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  $(`screen-${name}`).classList.add('active')
}

// Setup screen
$('btn-add-source').addEventListener('click', async () => {
  try {
    sourceHandles = await pickSourceFolders(sourceHandles)
    renderSourceList()
    updateStartButton()
  } catch (e) {
    if (e.name !== 'AbortError') console.error(e)
  }
})

$('target-display').addEventListener('click', async () => {
  try {
    targetHandle = await pickTargetFolder()
    $('target-name').textContent = targetHandle.name
    $('target-name').style.color = 'var(--text)'
    updateStartButton()
  } catch (e) {
    if (e.name !== 'AbortError') console.error(e)
  }
})

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')
    selectedMode = btn.dataset.mode
    $('p2-row').style.display = selectedMode === 'both' ? 'block' : 'none'
  })
})

function renderSourceList() {
  const list = $('source-list')
  list.innerHTML = sourceHandles.map((h, i) => `
    <div class="folder-item">
      <span>📁 ${h.name}</span>
      <button data-idx="${i}" title="Entfernen">×</button>
    </div>
  `).join('')
  list.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      sourceHandles.splice(Number(btn.dataset.idx), 1)
      renderSourceList()
      updateStartButton()
    })
  })
}

function updateStartButton() {
  $('btn-start').disabled = sourceHandles.length === 0 || !targetHandle
}

$('btn-start').addEventListener('click', startScan)

// Scan
async function startScan() {
  showScreen('processing')
  const startTime = Date.now()

  $('p2-row').style.display = selectedMode === 'both' ? 'block' : 'none'

  // Collect all file handles
  const allHandles = await collectImageFiles(sourceHandles)
  const total = allHandles.length

  // Start worker
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })

  worker.postMessage({ type: 'start', handles: allHandles, mode: selectedMode })

  worker.onmessage = ({ data }) => {
    if (data.type === 'phase1-progress') {
      const pct = Math.round((data.current / total) * 100)
      $('p1-fill').style.width = `${pct}%`
      $('p1-status').textContent = `${data.current} / ${total}`
      $('stat-exact').textContent = data.exactDuplicates
      const elapsed = (Date.now() - startTime) / 1000
      const eta = Math.round((elapsed / data.current) * (total - data.current))
      $('eta-text').textContent = eta > 5 ? `Phase 1: noch ca. ${eta}s...` : 'Fast fertig...'
    }

    if (data.type === 'phase2-progress') {
      $('p1-fill').style.width = '100%'
      $('p1-status').textContent = `${total} / ${total} ✓`
      const pct = Math.round((data.current / total) * 100)
      $('p2-fill').style.width = `${pct}%`
      $('p2-status').textContent = `${data.current} / ${total}`
      $('stat-similar').textContent = data.similarDuplicates
    }

    if (data.type === 'done') {
      uniqueHandles = data.uniqueHandles
      scanStats = data.stats
      worker.terminate()
      showResults()
    }

    if (data.type === 'error') {
      worker.terminate()
      alert(`Fehler: ${data.message}`)
      showScreen('setup')
    }
  }
}

function showResults() {
  const { scanned, exact, similar } = scanStats
  const unique = scanned - exact - similar

  $('res-scanned').textContent = scanned
  $('res-unique').textContent = unique
  $('res-exact').textContent = exact
  $('res-similar').textContent = similar

  // Folder preview (sample from first 8 unique files)
  buildFolderPreview()
  showScreen('results')
}

async function buildFolderPreview() {
  const { extractDate, dateToParts } = await import('./exif.js')
  const sample = uniqueHandles.slice(0, 20)
  const years = new Set()

  for (const h of sample) {
    const file = await h.getFile()
    const date = await extractDate(file)
    const { year } = dateToParts(date)
    years.add(year)
  }

  const sorted = [...years].sort()
  $('folder-preview').innerHTML = sorted.map(y =>
    `📁 ${targetHandle.name}/${y}/`
  ).join('<br>') + (uniqueHandles.length > 20 ? '<br>...' : '')
}

// Copy
$('btn-copy').addEventListener('click', async () => {
  $('btn-copy').disabled = true
  $('copy-progress-card').style.display = 'block'
  const total = uniqueHandles.length

  await copyUniqueFiles(uniqueHandles, targetHandle, (done, tot) => {
    $('copy-status').textContent = `${done} / ${tot}`
    $('copy-fill').style.width = `${Math.round((done / tot) * 100)}%`
  })

  $('btn-copy').textContent = '✓ Fertig!'
})

$('btn-restart').addEventListener('click', () => {
  sourceHandles = []; targetHandle = null; uniqueHandles = []; scanStats = {}
  renderSourceList()
  $('target-name').textContent = 'Noch kein Ordner gewählt'
  $('target-name').style.color = 'var(--muted)'
  updateStartButton()
  showScreen('setup')
})

// PWA service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/duplicate-finder/sw.js')
}
```

- [ ] **Step 8.3: Build and verify no compile errors**

```bash
npm run build 2>&1 | grep -E "(error|✓)"
```

Expected: `✓ built`

- [ ] **Step 8.4: Run local dev server and smoke-test in browser**

```bash
npm run dev
```

Open `http://localhost:5173/duplicate-finder/` in Chrome/Edge.
Verify:
- Setup screen shows with disabled Start button
- "+ Ordner hinzufügen" opens native folder picker
- "wählen" in Ziel-Ordner row opens native folder picker
- After both chosen, Start button becomes enabled
- Mode toggle switches between Exakt / Exakt+Ähnliche

- [ ] **Step 8.5: Commit**

```bash
git add src/main.js index.html
git commit -m "feat: main.js — full UI wiring, three screens, worker integration"
```

---

## Task 9: PWA service worker

**Files:**
- Verify: `vite.config.js` (vite-plugin-pwa already configured in Task 1)

vite-plugin-pwa automatically generates `sw.js` at build time — no manual `sw.js` needed in `public/`. The register call in `main.js` points to `/duplicate-finder/sw.js` which Vite generates.

- [ ] **Step 9.1: Verify PWA generation**

```bash
npm run build && ls dist/*.js dist/sw.js 2>/dev/null || ls dist/
```

Expected: `sw.js` or `registerSW.js` present in `dist/`

- [ ] **Step 9.2: Update manifest.json with correct icon paths**

Note: manifest.json currently references icon files that don't exist yet. Add placeholder icons or skip PWA install prompt. Simplest fix — remove icon entries from `public/manifest.json` for now, add real icons later:

```json
{
  "name": "Foto-Bereinigung",
  "short_name": "Foto-Bereinigung",
  "description": "Duplikate entfernen und Fotos nach Datum sortieren",
  "start_url": "/duplicate-finder/",
  "display": "standalone",
  "background_color": "#0d1117",
  "theme_color": "#64ffda"
}
```

- [ ] **Step 9.3: Commit and push — triggers GitHub Pages deploy**

```bash
git add -A
git commit -m "feat: PWA service worker via vite-plugin-pwa"
git push
```

- [ ] **Step 9.4: Verify live deploy**

```bash
gh run list --repo shwill/duplicate-finder --limit 1
```

Wait for `completed success`, then open `https://shwill.github.io/duplicate-finder/` in browser and verify it loads.

---

## Task 10: End-to-end test with real photos

- [ ] **Step 10.1: Prepare a test set**

Create a folder with:
- 10 real photos (JPG with EXIF)
- 3 exact copies of existing photos (different filenames)
- 2 photos that are visually similar (slight crop/resize)
- 2 photos with no EXIF and no date in filename

- [ ] **Step 10.2: Run full scan in Chrome**

Open `http://localhost:5173/duplicate-finder/` (or live URL).

Checklist:
- [ ] All 3 exact duplicates found and excluded
- [ ] At least 1 similar pair detected
- [ ] Output folder created with `YYYY/YYYY-MM/` structure
- [ ] Files with no date land in `Kein-Datum/`
- [ ] Filename conflicts resolved correctly (e.g., two files named `IMG_001.jpg` → `IMG_001.jpg` + `IMG_001_2.jpg`)
- [ ] No browser crashes or frozen UI during scan

- [ ] **Step 10.3: Final commit and push**

```bash
git push
```

Confirm live URL works for your wife.

---

## Running tests

```bash
npm test           # run all unit tests
npm run test:watch # watch mode during development
npm run dev        # local dev server at http://localhost:5173/duplicate-finder/
npm run build      # production build → dist/
git push           # triggers GitHub Pages deploy
```
