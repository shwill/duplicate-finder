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
