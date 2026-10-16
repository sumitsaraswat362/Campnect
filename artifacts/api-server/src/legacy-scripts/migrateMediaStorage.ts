// @ts-nocheck
import { createHash } from 'crypto'
import pg from 'pg'
import {
  ensureMediaStorage,
  mediaStorageLocation,
  readStoredMedia,
  uploadStoredMedia,
} from '../legacy-services/supabaseStorage.js'

const { Pool } = pg
const args = process.argv.slice(2)
const verifyOnly = args.includes('--verify')
const dryRun = args.includes('--dry-run')
const limitFlag = args.find((value) => value.startsWith('--limit='))
const followingLimit = args.indexOf('--limit')
const requestedLimit = Number(limitFlag?.slice('--limit='.length) || (followingLimit >= 0 ? args[followingLimit + 1] : 25))
const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 25

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.')

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })

function checksum(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function migrationBatch() {
  const client = await pool.connect()
  const summary = { processed: 0, migrated: 0, failed: 0, skipped: 0 }
  try {
    const result = await client.query(`
      SELECT id, purpose, mime_type, byte_size, checksum, data,
             storage_bucket, storage_path, storage_status
      FROM media_assets
      WHERE COALESCE(storage_status, 'legacy') <> 'storage_ready'
      ORDER BY created_at ASC
      LIMIT $1
    `, [limit])

    for (const asset of result.rows) {
      summary.processed += 1
      const bytes = Buffer.from(asset.data || [])
      if (!bytes.length || checksum(bytes) !== asset.checksum || bytes.length !== Number(asset.byte_size)) {
        summary.failed += 1
        if (!dryRun) {
          await client.query(
            `UPDATE media_assets
                SET storage_status = 'migration_failed'
              WHERE id = $1`,
            [asset.id],
          )
        }
        console.error(JSON.stringify({ event: 'media_storage_migration_failed', assetId: asset.id, reason: 'legacy_checksum_or_size_mismatch' }))
        continue
      }

      const location = asset.storage_bucket && asset.storage_path
        ? { bucket: asset.storage_bucket, path: asset.storage_path }
        : mediaStorageLocation(asset.id, asset.purpose, asset.mime_type)
      if (dryRun) {
        summary.skipped += 1
        console.info(JSON.stringify({ event: 'media_storage_migration_dry_run', assetId: asset.id, bucket: location.bucket, path: location.path }))
        continue
      }

      try {
        await client.query(`UPDATE media_assets SET storage_status = 'migrating' WHERE id = $1`, [asset.id])
        await uploadStoredMedia({
          bucket: location.bucket,
          path: location.path,
          bytes,
          mimeType: asset.mime_type,
          checksum: asset.checksum,
        })
        await client.query(
          `UPDATE media_assets
              SET storage_bucket = $2,
                  storage_path = $3,
                  storage_status = 'storage_ready',
                  storage_migrated_at = NOW(),
                  storage_checksum = $4,
                  storage_byte_size = $5
            WHERE id = $1`,
          [asset.id, location.bucket, location.path, asset.checksum, bytes.length],
        )
        summary.migrated += 1
        console.info(JSON.stringify({ event: 'media_storage_migrated', assetId: asset.id, byteSize: bytes.length }))
      } catch (error: any) {
        summary.failed += 1
        await client.query(
          `UPDATE media_assets
              SET storage_status = 'migration_failed'
            WHERE id = $1`,
          [asset.id],
        )
        console.error(JSON.stringify({ event: 'media_storage_migration_failed', assetId: asset.id, reason: String(error?.message || 'storage_error').slice(0, 240) }))
      }
    }
  } finally {
    client.release()
  }
  return summary
}

async function verificationBatch() {
  const client = await pool.connect()
  const summary = { checked: 0, verified: 0, failed: 0 }
  try {
    const result = await client.query(`
      SELECT id, storage_bucket, storage_path, storage_checksum, storage_byte_size
      FROM media_assets
      WHERE storage_status = 'storage_ready'
      ORDER BY storage_migrated_at ASC NULLS FIRST, created_at ASC
      LIMIT $1
    `, [limit])
    for (const asset of result.rows) {
      summary.checked += 1
      try {
        const bytes = await readStoredMedia(asset.storage_bucket, asset.storage_path)
        if (
          bytes.length !== Number(asset.storage_byte_size) ||
          checksum(bytes) !== asset.storage_checksum
        ) throw new Error('stored_checksum_or_size_mismatch')
        summary.verified += 1
        console.info(JSON.stringify({ event: 'media_storage_verified', assetId: asset.id, byteSize: bytes.length }))
      } catch (error: any) {
        summary.failed += 1
        console.error(JSON.stringify({ event: 'media_storage_verification_failed', assetId: asset.id, reason: String(error?.message || 'storage_error').slice(0, 240) }))
      }
    }
  } finally {
    client.release()
  }
  return summary
}

try {
  await ensureMediaStorage()
  const summary = verifyOnly ? await verificationBatch() : await migrationBatch()
  console.info(JSON.stringify({
    event: verifyOnly ? 'media_storage_verification_summary' : 'media_storage_migration_summary',
    ...summary,
    limit,
    dryRun,
  }))
  process.exitCode = summary.failed ? 1 : 0
} finally {
  await pool.end()
}