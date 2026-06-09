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
