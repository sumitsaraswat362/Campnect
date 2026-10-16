const OPENMOJI_STICKER_IDS = new Set([
  '1F44D', '2764', '1F525', '1F602', '1F606', '1F60E', '1F60D', '1F91D',
  '1F389', '1F64C', '1F3C6', '1F3EB', '1F4BB', '1F4F1', '1F4DA', '1F4A1',
  '270F', '1F355', '2615', '1F9CB', '1F436', '1F431', '1F98B', '1F600',
  '1F914', '1F622',
])

export function normalizeOpenMojiSticker(value: unknown): string | null {
  let payload: any
  try {
    payload = typeof value === 'string' ? JSON.parse(value) : value
  } catch {
    return null
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  if (payload.stickerPack !== 'openmoji' || typeof payload.stickerId !== 'string') return null
  if (!OPENMOJI_STICKER_IDS.has(payload.stickerId)) return null
  return JSON.stringify({ stickerPack: 'openmoji', stickerId: payload.stickerId })
}