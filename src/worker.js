import { dhash, hammingDistance } from './hash-utils.js'

const HAMMING_THRESHOLD = 10

self.onmessage = async ({ data }) => {
  const { type, handles, mode } = data
  if (type !== 'start') return

  try {
    const { unique: afterPhase1, exactCount } = await phase1(handles)

    if (mode === 'exact') {
      self.postMessage({ type: 'done', uniqueHandles: afterPhase1,
        stats: { scanned: handles.length, exact: exactCount, similar: 0 } })
      return
    }

    const { unique: afterPhase2, similarCount } = await phase2(afterPhase1)

    self.postMessage({ type: 'done', uniqueHandles: afterPhase2,
      stats: { scanned: handles.length, exact: exactCount, similar: similarCount } })
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
  const groups = new Map()
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
