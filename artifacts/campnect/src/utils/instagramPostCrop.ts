export const INSTAGRAM_POST_MIN_ASPECT_RATIO = 4 / 5
export const INSTAGRAM_POST_MAX_ASPECT_RATIO = 1.91

export interface PostCrop {
  zoom: number
  x: number
  y: number
}

export interface PostImageAdjustments {
  brightness: number
  contrast: number
  saturation: number
}

export const DEFAULT_POST_CROP: PostCrop = { zoom: 1, x: 0, y: 0 }
export const DEFAULT_POST_IMAGE_ADJUSTMENTS: PostImageAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
}

export function clampPostCrop(crop: PostCrop): PostCrop {
  return {
    zoom: Math.min(3, Math.max(1, crop.zoom)),
    x: Math.min(1, Math.max(-1, crop.x)),
    y: Math.min(1, Math.max(-1, crop.y)),
  }
}

/**
 * Produces a durable Instagram-compatible image. Posts retain their source
 * ratio when it is between Instagram's 4:5 and 1.91:1 limits; only out-of-
 * range photos (or a deliberate pinch zoom) are rasterized and cropped.
 * GIFs stay untouched so their animation is not flattened by canvas.
 */
export async function cropImageForInstagramPost(
  file: File,
  inputCrop: PostCrop = DEFAULT_POST_CROP,
  filter = 'none',
  inputAdjustments: PostImageAdjustments = DEFAULT_POST_IMAGE_ADJUSTMENTS,
): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  const crop = clampPostCrop(inputCrop)
  const adjustments = {
    brightness: Number.isFinite(inputAdjustments.brightness) ? inputAdjustments.brightness : 0,
    contrast: Number.isFinite(inputAdjustments.contrast) ? inputAdjustments.contrast : 0,
    saturation: Number.isFinite(inputAdjustments.saturation) ? inputAdjustments.saturation : 0,
  }
  const hasVisualEdits = filter !== 'none'
    || adjustments.brightness !== 0
    || adjustments.contrast !== 0
    || adjustments.saturation !== 0
  const sourceUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('The selected photo could not be cropped'))
      element.src = sourceUrl
    })
    const sourceAspect = image.naturalWidth / image.naturalHeight
    const targetAspect = Math.min(
      INSTAGRAM_POST_MAX_ASPECT_RATIO,
      Math.max(INSTAGRAM_POST_MIN_ASPECT_RATIO, sourceAspect),
    )
    if (!hasVisualEdits && crop.zoom === 1) {
      if (sourceAspect >= INSTAGRAM_POST_MIN_ASPECT_RATIO && sourceAspect <= INSTAGRAM_POST_MAX_ASPECT_RATIO) {
        return file
      }
    }
    const baseWidth = sourceAspect > targetAspect
      ? image.naturalHeight * targetAspect
      : image.naturalWidth
    const baseHeight = baseWidth / targetAspect
    const cropWidth = baseWidth / crop.zoom
    const cropHeight = baseHeight / crop.zoom
    const left = (image.naturalWidth - cropWidth) * ((crop.x + 1) / 2)
    const top = (image.naturalHeight - cropHeight) * ((crop.y + 1) / 2)
    const outputWidth = Math.min(1080, Math.max(360, Math.round(baseWidth)))
    const outputHeight = Math.round(outputWidth / targetAspect)
    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = outputHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Photo cropping is not available on this device')
    context.filter = [
      filter !== 'none' ? filter : '',
      `brightness(${1 + adjustments.brightness / 100})`,
      `contrast(${1 + adjustments.contrast / 100})`,
      `saturate(${1 + adjustments.saturation / 100})`,
    ].filter(Boolean).join(' ')
    context.drawImage(image, left, top, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('The selected photo could not be cropped')), 'image/jpeg', 0.92)
    })
    const name = file.name.replace(/\.[^.]+$/, '') || 'campnect-post'
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified })
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}