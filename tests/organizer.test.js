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
