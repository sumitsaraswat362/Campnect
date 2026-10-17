import { Capacitor, registerPlugin } from '@capacitor/core'

export type NativeGalleryMedia = {
  id: string
  name: string
  mimeType: string
  mediaType: 'image' | 'video'
  width: number
  height: number
  thumbnail: string
}

export type NativeGalleryPhoto = {
  id: string
  name: string
  mimeType: string
  mediaType: 'image'
  width: number
  height: number
  thumbnail: string
}

interface PhotoGalleryPlugin {
  pickPhoto(): Promise<{ data: string; mimeType: string; name: string }>
  getRecentMedia(options: { limit: number }): Promise<{ media: NativeGalleryMedia[] }>
  readMedia(options: { id: string }): Promise<{ data: string; mimeType: string; name: string }>
  getRecentPhotos(options: { limit: number }): Promise<{ photos: NativeGalleryPhoto[] }>
  readPhoto(options: { id: string }): Promise<{ data: string; mimeType: string; name: string }>
}

const PhotoGallery = registerPlugin<PhotoGalleryPlugin>('PhotoGallery')

export function hasNativeMediaGallery(): boolean {
  return Capacitor.getPlatform() === 'android'
}

export async function getRecentNativeMedia(limit = 60): Promise<NativeGalleryMedia[]> {
  if (!hasNativeMediaGallery()) return []
  const result = await PhotoGallery.getRecentMedia({ limit })
  return Array.isArray(result.media) ? result.media : []
}

function base64ToFile(data: string, mimeType: string, name: string): File {
  const binary = window.atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new File([bytes], name || `campnect-media-${Date.now()}`, { type: mimeType || 'application/octet-stream' })
}

export async function readNativeMedia(media: NativeGalleryMedia): Promise<File> {
  const result = await PhotoGallery.readMedia({ id: media.id })
  return base64ToFile(result.data, result.mimeType || media.mimeType, result.name || media.name)
}

export async function getRecentNativePhotos(limit = 60): Promise<NativeGalleryPhoto[]> {
  if (!hasNativeMediaGallery()) return []
  const result = await PhotoGallery.getRecentPhotos({ limit })
  return Array.isArray(result.photos) ? result.photos : []
}

export async function readNativePhoto(photo: NativeGalleryPhoto): Promise<File> {
  const result = await PhotoGallery.readPhoto({ id: photo.id })
  return base64ToFile(result.data, result.mimeType || photo.mimeType, result.name || photo.name)
}

/** Opens Android's document picker and returns a native-normalized image file. */
export async function pickNativePhoto(): Promise<File> {
  if (!hasNativeMediaGallery()) throw new Error('Native photo picking is unavailable.')
  const result = await PhotoGallery.pickPhoto()
  return base64ToFile(result.data, result.mimeType, result.name)
}