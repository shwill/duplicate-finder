# Review Screen Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-group review screen between scan completion and file copy so the user can see perceptual duplicate thumbnails and choose which images to keep.

**Architecture:** The worker's `done` message changes from a flat `uniqueHandles[]` to `groups[]` (perceptual duplicate groups, each with suggested + members + similarities) plus `autoKeptHandles[]` (singletons + exact-dup survivors). A new `src/review.js` renders one group at a time; after the user steps through all groups, the accumulated choices are merged with `autoKeptHandles` and passed to `copyUniqueFiles`. If zero groups exist (exact-only mode or no perceptual duplicates), the review screen is skipped entirely.

**Tech Stack:** Vite 8, Vanilla JS ES modules, OffscreenCanvas (worker), File System Access API, Vitest 4 (node environment)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/cc.js` | **Create** | Pure Connected Components algorithm (testable) |
| `tests/cc.test.js` | **Create** | Unit tests for cc.js |
| `src/worker.js` | **Modify** | Use cc.js; update `done` message shape |
| `src/review.js` | **Create** | Review screen state + DOM rendering |
| `index.html` | **Modify** | Add `#screen-review` container |
| `src/style.css` | **Modify** | Review card/grid styles |
| `src/main.js` | **Modify** | Handle new done message; wire review screen |

---

### Task 1: `src/cc.js` — Connected Components (with tests)

**Files:**
- Create: `src/cc.js`
- Create: `tests/cc.test.js`

The worker's current `dedupGroup` is a greedy algorithm that misses transitive similarities (A≈B, B≈C but A≠C → old code keeps A and C as separate "uniques"; CC keeps them in one group). This task extracts the correct algorithm as a pure, testable function.

- [ ] **Step 1: Write the failing tests**

Create `tests/cc.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { connectedComponents } from '../src/cc.js'

// Build a Uint8Array[8] hash with specific bits set
function makeHash(setBits = []) {
  const h = new Uint8Array(8)
  for (const bit of setBits) h[bit >> 3] |= 1 << (bit & 7)
  return h
}

describe('connectedComponents', () => {
  it('single entry → one singleton component', () => {
    const entries = [{ hash: makeHash([]) }]
    const result = connectedComponents(entries, 10)
    expect(result).toEqual([[0]])
  })

  it('two identical hashes → one component', () => {
    const h = makeHash([0, 1])
    const entries = [{ hash: h }, { hash: new Uint8Array(h) }]
    const result = connectedComponents(entries, 10)
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveLength(2)
  })

  it('two hashes differing by 12 bits with threshold 10 → two singletons', () => {
    const entries = [
      { hash: makeHash([]) },
      { hash: makeHash([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) } // 12 bits set → distance 12 > 10
    ]
    const result = connectedComponents(entries, 10)
    expect(result).toHaveLength(2)
    expect(result.every(c => c.length === 1)).toBe(true)
  })

  it('A≈B and B≈C but A not directly similar to C → all three in one component', () => {
    // A = bits 0-10 set (11 bits), B = bits 0-4 set (5 bits), C = no bits set
    // d(A,B) = 6 (bits 5-10 differ) ≤ 10 → A≈B
    // d(B,C) = 5 (bits 0-4 differ) ≤ 10 → B≈C
    // d(A,C) = 11 (bits 0-10 differ) > 10 → A not directly ≈ C
    const hashA = makeHash([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const hashB = makeHash([0, 1, 2, 3, 4])
    const hashC = makeHash([])
    const entries = [{ hash: hashA }, { hash: hashB }, { hash: hashC }]
    const result = connectedComponents(entries, 10)
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveLength(3)
    expect(result[0]).toContain(0)
    expect(result[0]).toContain(1)
    expect(result[0]).toContain(2)
  })

  it('two independent pairs → two components', () => {
    const h1 = makeHash([0])
    const h2 = makeHash([1])  // d=2 ≤ 10, pair 1
    const h3 = makeHash([32])
    const h4 = makeHash([33]) // d=2 ≤ 10, pair 2; d from h1>10
    // Make h3 far from h1: h1 has bit 0, h3 has bit 32 → XOR = 2 bits = distance 2? No wait...
    // Actually d(h1,h3) = bits that differ: bit 0 in h1, bit 32 in h3 → 2 bits differ → distance 2 ≤ 10
    // That would connect them. Let me use more bits to ensure they're far apart.
    const hA = makeHash([0, 1, 2, 3, 4])      // 5 bits in byte 0
    const hB = makeHash([0, 1, 2, 3, 4, 5])   // 6 bits in byte 0, d(hA,hB)=1 ≤ 10 → pair 1
    const hC = makeHash([40, 41, 42, 43, 44])  // 5 bits in byte 5
    const hD = makeHash([40, 41, 42, 43, 44, 45]) // 6 bits in byte 5, d(hC,hD)=1 ≤ 10 → pair 2
    // d(hA,hC) = 5+5 = 10 ≤ 10 → would connect! Need to use threshold 9 or pick bits more carefully.
    // Use threshold 0 for this test to ensure separation:
    const entries2 = [{ hash: makeHash([0]) }, { hash: makeHash([0]) }, { hash: makeHash([63]) }, { hash: makeHash([63]) }]
    const result2 = connectedComponents(entries2, 0)
    expect(result2).toHaveLength(2) // distance-0 pairs only
    expect(result2.every(c => c.length === 2)).toBe(true)
  })

  it('empty input → empty output', () => {
    expect(connectedComponents([], 10)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```
npm test -- tests/cc.test.js
```

Expected: `Cannot find module '../src/cc.js'`

- [ ] **Step 3: Create `src/cc.js`**

```js
import { hammingDistance } from './hash-utils.js'

// connectedComponents finds all transitively-connected groups.
// entries: Array<{ hash: Uint8Array }>
// threshold: max Hamming distance (inclusive) to consider two entries similar
// returns: Array<number[]> — each inner array is a component (indices into entries)
export function connectedComponents(entries, threshold) {
  const n = entries.length
  if (n === 0) return []

  const adj = Array.from({ length: n }, () => [])
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      if (hammingDistance(entries[a].hash, entries[b].hash) <= threshold) {
        adj[a].push(b)
        adj[b].push(a)
      }
    }
  }

  const visited = new Uint8Array(n)
  const components = []

  for (let start = 0; start < n; start++) {
    if (visited[start]) continue
    const component = []
    const queue = [start]
    visited[start] = 1
    while (queue.length > 0) {
      const cur = queue.shift()
      component.push(cur)
      for (const nb of adj[cur]) {
        if (!visited[nb]) {
          visited[nb] = 1
          queue.push(nb)
        }
      }
    }
    components.push(component)
  }

  return components
}
```

- [ ] **Step 4: Run tests — expect all to pass**

```
npm test -- tests/cc.test.js
```

Expected: all 6 tests PASS

- [ ] **Step 5: Run full test suite — expect no regressions**

```
npm test
```

Expected: all existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add src/cc.js tests/cc.test.js
git commit -m "feat: add connected-components algorithm for perceptual duplicate grouping"
```

---

### Task 2: Refactor `src/worker.js`

**Files:**
- Modify: `src/worker.js`

Replace the current `phase2` + `dedupGroup` with the Connected Components approach. The `done` message shape changes from `{ uniqueHandles }` to `{ groups, autoKeptHandles }`.

Key changes:
- Import `connectedComponents` from `./cc.js`
- `phase2` now stores `{ handle, hash, width, height }` per entry (width/height from ImageBitmap, needed for the review UI)
- `phase2` returns `{ groups, autoKeptHandles, similarCount }` instead of `{ unique, similarCount }`
- `done` message: `{ type:'done', groups, autoKeptHandles, stats }`
- Exact-only mode: `done` message is `{ type:'done', groups:[], autoKeptHandles: afterPhase1, stats }`
- `HAMMING_THRESHOLD` comparison changes from `<` (strict) to `<=` (inclusive, matching the spec)

> Note: changing `<` to `<=` at threshold 10 means hamming distance exactly 10 is now considered similar. This is intentional — the spec requires `<=`.

- [ ] **Step 1: Replace `src/worker.js` entirely**

```js
import { dhash, hammingDistance } from './hash-utils.js'
import { connectedComponents } from './cc.js'

const HAMMING_THRESHOLD = 10

self.onmessage = async ({ data }) => {
  const { type, handles, mode } = data
  if (type !== 'start') return

  try {
    const { unique: afterPhase1, exactCount } = await phase1(handles)

    if (mode === 'exact') {
      self.postMessage({
        type: 'done',
        groups: [],
        autoKeptHandles: afterPhase1,
        stats: { scanned: handles.length, exact: exactCount, similar: 0 }
      })
      return
    }

    const { groups, autoKeptHandles, similarCount } = await phase2(afterPhase1)

    self.postMessage({
      type: 'done',
      groups,
      autoKeptHandles,
      stats: { scanned: handles.length, exact: exactCount, similar: similarCount }
    })
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message })
  }
}

async function phase1(handles) {
  const seen = new Map()
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
  const canvas = new OffscreenCanvas(9, 8)
  const ctx = canvas.getContext('2d')
  const entries = []

  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i]
    const file = await handle.getFile()
    const month = getMonthKey(file)

    const bitmap = await createImageBitmap(file)
    const width = bitmap.width
    const height = bitmap.height
    ctx.drawImage(bitmap, 0, 0, 9, 8)
    bitmap.close()
    const { data } = ctx.getImageData(0, 0, 9, 8)
    const hash = dhash(data)

    entries.push({ handle, hash, width, height, month })

    if (i % 20 === 0) {
      self.postMessage({ type: 'phase2-progress', current: i + 1,
        total: handles.length, similarDuplicates: 0 })
    }
  }

  // Group entries by month for O(n²) reduction
  const monthBuckets = new Map()
  entries.forEach((entry, idx) => {
    if (!monthBuckets.has(entry.month)) monthBuckets.set(entry.month, [])
    monthBuckets.get(entry.month).push(idx)
  })

  const groups = []
  const autoKeptHandles = []
  let similarCount = 0

  for (const bucketIndices of monthBuckets.values()) {
    const bucketEntries = bucketIndices.map(i => entries[i])
    const components = connectedComponents(bucketEntries, HAMMING_THRESHOLD)

    for (const component of components) {
      if (component.length === 1) {
        autoKeptHandles.push(entries[bucketIndices[component[0]]].handle)
        continue
      }

      // Find suggested: member with highest pixel area
      const componentEntries = component.map(localIdx => entries[bucketIndices[localIdx]])
      const suggestedLocalIdx = componentEntries.reduce(
        (best, e, i) => e.width * e.height > componentEntries[best].width * componentEntries[best].height ? i : best,
        0
      )

      // Reorder: suggested first
      const reordered = [
        componentEntries[suggestedLocalIdx],
        ...componentEntries.filter((_, i) => i !== suggestedLocalIdx)
      ]

      const suggestedHash = reordered[0].hash

      groups.push({
        suggested: reordered[0].handle,
        members: reordered.map(e => e.handle),
        similarities: reordered.map((e, i) => i === 0 ? 0 : hammingDistance(e.hash, suggestedHash)),
        widths: reordered.map(e => e.width),
        heights: reordered.map(e => e.height)
      })

      similarCount += component.length - 1
    }
  }

  self.postMessage({ type: 'phase2-progress', current: handles.length,
    total: handles.length, similarDuplicates: similarCount })

  return { groups, autoKeptHandles, similarCount }
}

function getMonthKey(file) {
  const d = new Date(file.lastModified)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
```

- [ ] **Step 2: Run full test suite — expect no regressions**

```
npm test
```

Expected: all existing tests pass (worker.js has no unit tests; cc.js tests cover the extracted logic)

- [ ] **Step 3: Commit**

```bash
git add src/worker.js
git commit -m "feat: replace greedy dedupGroup with connected-components in worker; update done message shape"
```

---

### Task 3: `index.html` + `src/style.css` — review screen container and styles

**Files:**
- Modify: `index.html` (add `#screen-review` after `#screen-processing`, before `#screen-results`)
- Modify: `src/style.css` (append review styles)

- [ ] **Step 1: Add `#screen-review` to `index.html`**

In `index.html`, locate the line:
```html
      <!-- Screen 3: Results -->
```

Insert the following block immediately before it:

```html
      <!-- Screen 3: Review -->
      <div id="screen-review" class="screen">
        <div class="card">
          <div id="review-header"></div>
          <div id="review-progress"></div>
          <div id="review-grid" class="review-grid"></div>
          <div id="review-actions"></div>
        </div>
      </div>

```

- [ ] **Step 2: Append review styles to `src/style.css`**

Append to the end of `src/style.css`:

```css
/* Review screen */
.review-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 4px;
}

.review-card {
  border: 2px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s;
}

.review-card.selected { border-color: var(--green); }

.review-thumb {
  position: relative;
  aspect-ratio: 4/3;
  background: var(--bg);
  overflow: hidden;
}

.review-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.review-pill {
  position: absolute;
  top: 6px;
  left: 6px;
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  pointer-events: none;
}

.review-pill.keep { background: var(--green); color: #0d2010; }
.review-pill.skip { background: var(--border); color: var(--muted); }

.review-meta {
  background: var(--surface);
  padding: 8px 10px;
}

.review-filename {
  font-size: 12px;
  color: var(--text);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.review-info { font-size: 11px; color: var(--muted); }

.review-badge {
  margin-top: 5px;
  display: inline-block;
  background: #1a2744;
  border-radius: 3px;
  padding: 2px 6px;
  font-size: 10px;
  color: var(--blue);
}

.review-badge.original { color: #93c5fd; }
```

- [ ] **Step 3: Verify build compiles without errors**

```
npm run build
```

Expected: build succeeds, no errors

- [ ] **Step 4: Commit**

```bash
git add index.html src/style.css
git commit -m "feat: add review screen HTML container and CSS styles"
```

---

### Task 4: Create `src/review.js` — review screen logic

**Files:**
- Create: `src/review.js`

This module owns all review screen state and DOM manipulation. It exports one function: `initReview(groups, autoKeptHandles, onComplete)`. The `onComplete` callback receives the merged array of all handles the user chose to keep.

- [ ] **Step 1: Create `src/review.js`**

```js
const $ = id => document.getElementById(id)

let _groups = []
let _autoKeptHandles = []
let _groupIndex = 0
let _selections = new Set()
let _keptHandles = []
let _onComplete = null
let _objectURLs = []

export async function initReview(groups, autoKeptHandles, onComplete) {
  _groups = groups
  _autoKeptHandles = autoKeptHandles
  _groupIndex = 0
  _keptHandles = []
  _onComplete = onComplete
  await renderGroup(0)
}

async function renderGroup(idx) {
  const group = _groups[idx]
  _selections = new Set([0])

  _objectURLs.forEach(url => URL.revokeObjectURL(url))
  _objectURLs = []

  $('review-header').innerHTML = `
    <h2 style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:4px">
      Gruppe ${idx + 1} von ${_groups.length} ähnlichen Bildern
    </h2>
    <p style="font-size:12px;color:var(--muted)">Klicke auf ein Bild um die Auswahl zu ändern. Mehrfachauswahl möglich.</p>
  `

  const pct = Math.round(((idx + 1) / _groups.length) * 100)
  $('review-progress').innerHTML = `
    <div style="background:var(--bg);border-radius:6px;height:4px;margin:10px 0 14px">
      <div style="background:var(--blue);height:4px;border-radius:6px;width:${pct}%;transition:width 0.3s"></div>
    </div>
  `

  const grid = $('review-grid')
  grid.innerHTML = ''

  for (let i = 0; i < group.members.length; i++) {
    const handle = group.members[i]
    const file = await handle.getFile()
    const url = URL.createObjectURL(file)
    _objectURLs.push(url)

    const sizeMB = (file.size / 1024 / 1024).toFixed(1)
    const date = new Date(file.lastModified).toLocaleDateString('de-DE')
    const isSuggested = i === 0
    const simPct = isSuggested ? null : Math.round((1 - group.similarities[i] / 64) * 100)
    const isSelected = _selections.has(i)

    const card = document.createElement('div')
    card.className = 'review-card' + (isSelected ? ' selected' : '')
    card.dataset.idx = String(i)
    card.innerHTML = `
      <div class="review-thumb">
        <img src="${url}" alt="${file.name}" loading="lazy" />
        <div class="review-pill ${isSelected ? 'keep' : 'skip'}">${isSelected ? '✓ BEHALTEN' : 'ÜBERSPRINGEN'}</div>
      </div>
      <div class="review-meta">
        <div class="review-filename">${file.name}</div>
        <div class="review-info">${group.widths[i]} × ${group.heights[i]} px</div>
        <div class="review-info">${sizeMB} MB · ${date}</div>
        <div class="review-badge${isSuggested ? ' original' : ''}">${isSuggested ? 'Originalauflösung' : simPct + '% ähnlich'}</div>
      </div>
    `
    card.addEventListener('click', () => toggleCard(card, i))
    grid.appendChild(card)
  }

  updateActions()
}

function toggleCard(card, idx) {
  if (_selections.has(idx)) {
    _selections.delete(idx)
    card.classList.remove('selected')
    card.querySelector('.review-pill').className = 'review-pill skip'
    card.querySelector('.review-pill').textContent = 'ÜBERSPRINGEN'
  } else {
    _selections.add(idx)
    card.classList.add('selected')
    card.querySelector('.review-pill').className = 'review-pill keep'
    card.querySelector('.review-pill').textContent = '✓ BEHALTEN'
  }
  updateActions()
}

function keepAll() {
  const group = _groups[_groupIndex]
  for (let i = 0; i < group.members.length; i++) _selections.add(i)
  $('review-grid').querySelectorAll('.review-card').forEach((card, i) => {
    card.classList.add('selected')
    const pill = card.querySelector('.review-pill')
    pill.className = 'review-pill keep'
    pill.textContent = '✓ BEHALTEN'
  })
  advance()
}

async function advance() {
  const group = _groups[_groupIndex]
  for (const idx of _selections) _keptHandles.push(group.members[idx])

  _groupIndex++
  if (_groupIndex < _groups.length) {
    await renderGroup(_groupIndex)
  } else {
    _objectURLs.forEach(url => URL.revokeObjectURL(url))
    _objectURLs = []
    _onComplete([..._keptHandles, ..._autoKeptHandles])
  }
}

function updateActions() {
  const group = _groups[_groupIndex]
  const skipCount = group.members.length - _selections.size
  const weiterLabel = skipCount > 0 ? `→ Weiter (${skipCount} überspringen)` : '→ Weiter'

  $('review-actions').innerHTML = `
    <div style="display:flex;gap:10px;margin-top:14px">
      <button id="btn-keep-all" class="btn btn-secondary" style="flex:1">Alle behalten</button>
      <button id="btn-advance" class="btn btn-primary" style="flex:2">${weiterLabel}</button>
    </div>
    <div style="margin-top:12px;padding:10px;background:var(--bg);border-radius:8px;border-left:3px solid var(--blue)">
      <p style="color:var(--muted);font-size:12px;margin:0">💡 Grüner Rahmen = wird kopiert.</p>
    </div>
  `
  $('btn-keep-all').addEventListener('click', keepAll)
  $('btn-advance').addEventListener('click', advance)
}
```

- [ ] **Step 2: Verify build compiles without errors**

```
npm run build
```

Expected: build succeeds (review.js is not yet imported by anything, so no errors)

- [ ] **Step 3: Commit**

```bash
git add src/review.js
git commit -m "feat: add review.js — per-group review screen state and DOM rendering"
```

---

### Task 5: Update `src/main.js` — wire review screen

**Files:**
- Modify: `src/main.js`

Three changes:
1. Import `initReview` from `./review.js`
2. Handle the new `done` message (receive `groups` + `autoKeptHandles` instead of `uniqueHandles`)
3. Update `showResults` to compute `similar` from final handle counts rather than raw `stats.similar`
4. Reset `autoKeptHandles` state on restart

- [ ] **Step 1: Apply all changes to `src/main.js`**

Replace the current `src/main.js` entirely with:

```js
import { pickSourceFolders, pickTargetFolder, collectImageFiles } from './filesystem.js'
import { copyUniqueFiles } from './organizer.js'
import { initReview } from './review.js'

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

  const allHandles = await collectImageFiles(sourceHandles)
  const total = allHandles.length

  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })

  worker.postMessage({ type: 'start', handles: allHandles, mode: selectedMode })

  worker.onmessage = ({ data }) => {
    if (data.type === 'phase1-progress') {
      const pct = Math.round((data.current / total) * 100)
      $('p1-fill').style.width = `${pct}%`
      $('p1-status').textContent = `${data.current} / ${total}`
      $('stat-exact').textContent = data.exactDuplicates
      const elapsed = (Date.now() - startTime) / 1000
      if (data.current > 0) {
        const eta = Math.round((elapsed / data.current) * (total - data.current))
        $('eta-text').textContent = eta > 5 ? `Phase 1: noch ca. ${eta}s...` : 'Fast fertig...'
      }
    }

    if (data.type === 'phase2-progress') {
      $('p1-fill').style.width = '100%'
      $('p1-status').textContent = `${total} / ${total} ✓`
      const pct = Math.round((data.current / data.total) * 100)
      $('p2-fill').style.width = `${pct}%`
      $('p2-status').textContent = `${data.current} / ${data.total}`
      $('stat-similar').textContent = data.similarDuplicates
    }

    if (data.type === 'done') {
      const { groups, autoKeptHandles, stats } = data
      scanStats = stats
      worker.terminate()

      if (groups.length === 0) {
        // No perceptual groups — skip review, copy everything from autoKeptHandles
        uniqueHandles = autoKeptHandles
        showResults()
      } else {
        showScreen('review')
        initReview(groups, autoKeptHandles, (allKept) => {
          uniqueHandles = allKept
          showResults()
        })
      }
    }

    if (data.type === 'error') {
      worker.terminate()
      alert(`Fehler: ${data.message}`)
      showScreen('setup')
    }
  }
}

async function showResults() {
  const { scanned, exact } = scanStats
  const unique = uniqueHandles.length
  const similar = scanned - exact - unique

  $('res-scanned').textContent = scanned
  $('res-unique').textContent = unique
  $('res-exact').textContent = exact
  $('res-similar').textContent = Math.max(0, similar)

  await buildFolderPreview()
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

  await copyUniqueFiles(uniqueHandles, targetHandle, (done, tot) => {
    $('copy-status').textContent = `${done} / ${tot}`
    $('copy-fill').style.width = `${Math.round((done / tot) * 100)}%`
  })

  $('btn-copy').textContent = '✓ Fertig!'
})

$('btn-restart').addEventListener('click', () => {
  sourceHandles = []; targetHandle = null; uniqueHandles = []; scanStats = {}
  selectedMode = 'both'
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'))
  document.querySelector('.mode-btn[data-mode="both"]').classList.add('selected')
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

- [ ] **Step 2: Run full test suite — expect no regressions**

```
npm test
```

Expected: all tests pass

- [ ] **Step 3: Build and smoke-test in browser**

```
npm run dev
```

Open `http://localhost:5173/duplicate-finder/`. Verify:
- Setup screen loads correctly
- Mode toggle still works
- No console errors on page load

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat: wire review screen into main.js; update done-message handling"
```

---

## Verification Checklist

After all tasks are complete:

- [ ] `npm test` — all tests pass (including new cc.test.js)
- [ ] `npm run build` — builds without errors or warnings
- [ ] In browser: setup → scan with "Exakt + Ähnliche" → review screen appears for each group
- [ ] Clicking a card toggles selection (green border / pill label)
- [ ] "Alle behalten" selects all cards
- [ ] "Weiter" button count updates live as selection changes
- [ ] After stepping through all groups, results screen appears with correct stats
- [ ] With "Nur exakte" mode: review screen is skipped, goes directly to results
- [ ] Restart button returns to setup with all state cleared
