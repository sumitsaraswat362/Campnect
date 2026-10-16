// @ts-nocheck
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const PROCESS_TIMEOUT_MS = 30_000
const MAX_GENERATED_BYTES = 60 * 1024 * 1024
const MAGICK_RESOURCE_ARGS = [
  '-limit', 'memory', '256MiB',
  '-limit', 'map', '512MiB',
  '-limit', 'disk', '1GiB',
  '-limit', 'time', '25',
]
// This is intentionally well below ImageMagick's default resource limits. It
// prevents a small, highly-compressed upload from allocating an unbounded image.
export const MAX_IMAGE_PIXELS = 40_000_000

export type ImageInfo = { mimeType: string, width: number, height: number }
export type OptimizedImage = ImageInfo & {
  buffer: Buffer
  sourceMimeType: string
  sourceByteSize: number
  optimizationStatus: 'optimized' | 'original'
}

function webpMagic(buffer: Buffer) {
  return buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
}

function jpegMagic(buffer: Buffer) {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
}

async function run(command: string, args: string[], label: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const safeArgs = command !== 'magick'
      ? args
      : args[0] === 'identify'
        ? ['identify', ...MAGICK_RESOURCE_ARGS, ...args.slice(1)]
        : [...MAGICK_RESOURCE_ARGS, ...args]
    const child = spawn(command, safeArgs, { stdio: ['ignore', 'pipe', 'pipe'] })
    const output: Buffer[] = []
    const errors: Buffer[] = []
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      error ? reject(error) : resolve(Buffer.concat(output))
    }
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      finish(new Error(`${label} timed out`))
    }, PROCESS_TIMEOUT_MS)
    child.stdout.on('data', chunk => output.push(Buffer.from(chunk)))
    child.stderr.on('data', chunk => errors.push(Buffer.from(chunk)))
    child.on('error', error => finish(new Error(`${label} could not start: ${error.message}`)))
    child.on('close', code => {
      if (code !== 0) {
        const detail = Buffer.concat(errors).toString('utf8').trim().slice(-500)
        finish(new Error(`${label} failed${detail ? `: ${detail}` : ''}`))
      } else finish()
    })
  })
}

async function withFiles<T>(input: Buffer, work: (inputPath: string, dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'campnect-image-'))
  const inputPath = join(dir, 'input')
  try {
    await writeFile(inputPath, input, { mode: 0o600 })
    return await work(inputPath, dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function parseInfo(value: Buffer): ImageInfo {
  const [format, widthText, heightText] = value.toString('utf8').trim().split(/\s+/)
  const mimeType = ({ JPEG: 'image/jpeg', PNG: 'image/png', WEBP: 'image/webp', GIF: 'image/gif' } as any)[format]
  const width = Number(widthText)
  const height = Number(heightText)
  if (!mimeType || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width * height > MAX_IMAGE_PIXELS) {
    throw new Error('Image is malformed or exceeds the maximum pixel count.')
  }
  return { mimeType, width, height }
}

async function inspect(path: string): Promise<ImageInfo> {
  // Ping reads headers only and ImageMagick's resource limits remain an
  // additional defence while decoding for conversion. Inspecting frame zero
  // avoids concatenated identify output for animated GIFs while still
  // validating the dimensions used by display/download paths.
  return parseInfo(await run('magick', ['identify', '-ping', '-format', '%m %w %h', `${path}[0]`], 'Image inspection'))
}

/** Decode and validate any permitted still/animated image without modifying it. */
export async function validateImage(input: Buffer): Promise<ImageInfo> {
  if (!input.length) throw new Error('Uploaded image is empty.')
  return withFiles(input, inputPath => inspect(inputPath))
}

/**
 * Converts only JPEG and PNG still images. Failure after a successful source
 * validation is deliberately non-fatal: callers retain the validated original.
 */
export async function optimizeImage(input: Buffer, sourceMimeType: string): Promise<OptimizedImage> {
  const source = await validateImage(input)
  if (source.mimeType !== sourceMimeType) throw new Error('Image MIME does not match its contents.')
  const original = (): OptimizedImage => ({
    ...source, buffer: input, sourceMimeType, sourceByteSize: input.length, optimizationStatus: 'original',
  })
  if (sourceMimeType !== 'image/jpeg' && sourceMimeType !== 'image/png') return original()
  try {
    return await withFiles(input, async (inputPath, dir) => {
      const outputPath = join(dir, 'output.webp')
      // -strip removes profiles/exif; -auto-orient applies EXIF orientation
      // without resizing. Explicit WebP alpha quality prevents transparent PNG
      // edges from being needlessly degraded.
      await run('magick', [
        inputPath, '-auto-orient', '-strip', '-quality', '82',
        '-define', 'webp:alpha-quality=90', '-define', 'webp:method=6', outputPath,
      ], 'Image optimization')
      const outputStats = await stat(outputPath)
      if (!outputStats.size || outputStats.size > MAX_GENERATED_BYTES) {
        throw new Error('Image optimizer produced an invalid output size.')
      }
      if (outputStats.size >= input.length * 0.95) return original()
      const output = await readFile(outputPath)
      if (!output.length || !webpMagic(output)) throw new Error('Image optimizer produced invalid WebP output.')
      const info = await inspect(outputPath)
      const sameDimensions = (info.width === source.width && info.height === source.height) ||
        // EXIF orientation may rotate the presentation rectangle, but must not
        // resample it or alter its pixel count.
        (info.width === source.height && info.height === source.width)
      if (info.mimeType !== 'image/webp' || !sameDimensions) {
        throw new Error('Image optimizer changed image dimensions.')
      }
      return { ...info, buffer: output, sourceMimeType, sourceByteSize: input.length, optimizationStatus: 'optimized' }
    })
  } catch {
    return original()
  }
}

export async function makeJpegDownload(input: Buffer, mimeType: string): Promise<Buffer> {
  const source = await validateImage(input)
  if (source.mimeType !== mimeType) throw new Error('Image MIME does not match its contents.')
  if (mimeType === 'image/jpeg' && jpegMagic(input)) return input
  return withFiles(input, async (inputPath, dir) => {
    const outputPath = join(dir, 'download.jpg')
    // [0] intentionally selects the first GIF frame. Background flattening
    // gives transparent PNG/WebP pixels a deterministic white appearance.
    await run('magick', [
      `${inputPath}[0]`, '-auto-orient', '-background', 'white', '-alpha', 'remove',
      '-alpha', 'off', '-strip', '-quality', '95', outputPath,
    ], 'JPEG download conversion')
    const outputStats = await stat(outputPath)
    if (!outputStats.size || outputStats.size > MAX_GENERATED_BYTES) {
      throw new Error('JPEG conversion produced an invalid output size.')
    }
    const output = await readFile(outputPath)
    if (!output.length || !jpegMagic(output)) throw new Error('JPEG conversion produced invalid output.')
    const info = await inspect(outputPath)
    if (info.mimeType !== 'image/jpeg') throw new Error('JPEG conversion produced invalid output.')
    const sameDimensions = (info.width === source.width && info.height === source.height) ||
      (info.width === source.height && info.height === source.width)
    if (!sameDimensions) throw new Error('JPEG conversion changed image dimensions.')
    return output
  })
}