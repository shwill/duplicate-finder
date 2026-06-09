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
