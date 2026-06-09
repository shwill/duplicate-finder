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
