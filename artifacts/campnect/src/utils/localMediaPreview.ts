/**
 * Android WebView can expose selected images as Blob URLs that stop rendering
 * while the same File is still valid for multipart upload. Data URLs are more
 * reliable for local image previews and remain valid across composer steps.
 * Videos stay as Blob URLs to avoid duplicating large files in memory.
 */
export async function createLocalMediaPreview(file: File | Blob): Promise<string> {
  const fileName = 'name' in file ? String((file as File).name || '') : ''
  const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(fileName)
  if (!isImage) return URL.createObjectURL(file)

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:image/')) {
        resolve(reader.result)
      } else {
        reject(new Error('Selected image could not be prepared for preview'))
      }
    }
    reader.onerror = () => reject(reader.error || new Error('Selected image could not be read'))
    reader.readAsDataURL(file)
  })
}

export function disposeLocalMediaPreview(url?: string | null): void {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
}