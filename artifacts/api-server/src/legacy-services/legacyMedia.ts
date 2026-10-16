// @ts-nocheck
import fs from 'fs/promises'
import path from 'path'
import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { UPLOADS_DIR } from '../legacy-middleware/upload.js'
import { withTransaction } from '../legacy-db/index.js'

async function filesUnder(directory: string): Promise<string[]> {
  let entries: Awaited<ReturnType<typeof fs.readdir>>
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }

  const files: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesUnder(fullPath))
    else if (entry.isFile()) files.push(fullPath)
  }
  return files
}

/**
 * Move any files created by the old disk-upload implementation into the
 * durable media_assets table. This is intentionally best-effort per file:
 * one damaged legacy file must not prevent the API from starting.
 */
export async function migrateLegacyUploads() {
  const files = await filesUnder(UPLOADS_DIR)
  if (!files.length) return

  let migrated = 0
  for (const filePath of files) {
    const relative = path.relative(UPLOADS_DIR, filePath).split(path.sep).join('/')
    const legacyPath = `/uploads/${relative}`
    try {
      const data = await fs.readFile(filePath)
      const checksum = createHash('sha256').update(data).digest('hex')
      const mimeType = mimeFromExtension(path.extname(filePath))
      await withTransaction(async (tx) => {
        await tx.run(`
          INSERT INTO media_assets
            (id, owner_id, entity_type, purpose, data, mime_type, original_name, byte_size, checksum, legacy_path)
          VALUES ($1, NULL, 'legacy', 'legacy_upload', $2, $3, $4, $5, $6, $7)
          ON CONFLICT (legacy_path) DO NOTHING
        `, [uuidv4(), data, mimeType, path.basename(filePath), data.length, checksum, legacyPath])

        const asset = await tx.one<{ id: string }>(
          'SELECT id FROM media_assets WHERE legacy_path = $1',
          [legacyPath],
        )
        if (!asset) throw new Error('Legacy media asset was not created.')
        const durableUrl = `/api/media/${asset.id}`

        for (const tableColumn of [
          ['users', 'avatar_url'], ['users', 'cover_url'],
          ['stories', 'media_url'], ['stories', 'thumbnail_url'],
          ['highlights', 'cover_url'], ['highlight_stories', 'media_url'],
          ['conversations', 'avatar_url'], ['messages', 'media_url'],
          ['college_verifications', 'id_photo_url'], ['college_verifications', 'selfie_url'],
          ['communities', 'avatar_url'], ['communities', 'cover_url'],
          ['events', 'cover_url'],
        ] as const) {
          await tx.run(`UPDATE ${tableColumn[0]} SET ${tableColumn[1]} = $1 WHERE ${tableColumn[1]} = $2`, [durableUrl, legacyPath])
        }

        const posts = await tx.all<{ id: string; media: unknown }>(
          'SELECT id, media FROM posts WHERE media LIKE $1',
          [`%${legacyPath}%`],
        )
        for (const post of posts) {
          const media = parseJson(post.media)
          if (!Array.isArray(media)) continue
          const updated = media.map((value) => value === legacyPath ? durableUrl : value)
          await tx.run('UPDATE posts SET media = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(updated), post.id])
        }
      })
      migrated += 1
    } catch (error: any) {
      console.error(`[media] legacy migration failed for ${legacyPath}:`, error.message)
    }
  }

  if (migrated) console.log(`✅ Migrated ${migrated} legacy upload(s) into durable media storage.`)
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return null }
}

function mimeFromExtension(extension: string): string {
  const normalized = extension.toLowerCase()
  const known: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4',
    '.webm': 'video/webm', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  }
  return known[normalized] || 'application/octet-stream'
}