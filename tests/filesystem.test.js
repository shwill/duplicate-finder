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
