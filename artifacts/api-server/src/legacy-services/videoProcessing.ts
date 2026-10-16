// @ts-nocheck
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { fileTypeFromBuffer } from 'file-type'
import { assertMediaUploadSize, assertVideoDuration, isMediaPolicyError, MediaPolicyError } from './mediaLimits.js'

const PROCESS_TIMEOUT_MS = 120_000
const MAX_PROCESS_OUTPUT_BYTES = 100 * 1024 * 1024
const MAX_DIAGNOSTIC_BYTES = 64 * 1024
// Bound expensive decoders/encoders without introducing a second pipeline.
let runningProcesses = 0
const processWaiters: Array<() => void> = []
// Only results produced/validated by this module can bypass a second encode.
// Buffer identity plus checksum makes this independent of request fields and
// prevents mutation of a previously validated Buffer from bypassing checks.
const deliveryResults = new WeakMap<Buffer, {
  checksum: string, sourceDuration: number, duration: number, optimizationStatus: string,
}>()

function rememberDelivery(result) {
  deliveryResults.set(result.buffer, {
    checksum: createHash('sha256').update(result.buffer).digest('hex'),
    sourceDuration: result.sourceDuration,
    duration: result.duration,
    optimizationStatus: result.optimizationStatus || 'optimized',
  })
  return result
}

async function acquireProcess() {
  if (runningProcesses < 2) {
    runningProcesses++
    return
  }
  if (processWaiters.length >= 4) {
    throw new MediaPolicyError('OPTIMIZATION_FAILED', 'Media processing is busy. Please try again shortly.', 503)
  }
  await new Promise<void>(resolve => processWaiters.push(resolve))
}

function releaseProcess() {
  const next = processWaiters.shift()
  if (next) next()
  else runningProcesses--
}

export type GlimpseVideoOptions = {
  start: number
  end: number
  speed: number
  filter: string
  maxDuration?: number
  /** Set false for feed videos that must be delivery-optimized. */
  preserveOriginal?: boolean
}

const VIDEO_FILTERS: Record<string, string> = {
  none: '',
  vivid: 'eq=saturation=1.35:contrast=1.1:brightness=0.02',
  warm: 'colorbalance=rs=.08:gs=.03:bs=-.03',
  mono: 'hue=s=0:contrast=1.1',
}

async function runProcess(command: string, args: string[], input: Buffer, outputLabel: string): Promise<Buffer> {
  // MOV/MP4 files may place their moov atom at the end of the container.
  // FFmpeg cannot seek through those files when they are supplied as pipe:0,
  // so stage only this request's bytes in a private temporary directory.
  await acquireProcess()
  let tempDir: string | undefined
  try {
    tempDir = await mkdtemp(join(tmpdir(), 'campnect-video-'))
    const inputPath = join(tempDir, 'input')
    await writeFile(inputPath, input, { mode: 0o600 })
    const mp4Output = command === 'ffmpeg' && args.at(-1) === 'pipe:1' && args[args.lastIndexOf('-f') + 1] === 'mp4'
    const outputPath = join(tempDir, 'output.mp4')
    const processArgs = args.map(arg => arg === 'pipe:0' ? inputPath : mp4Output && arg === 'pipe:1' ? outputPath : arg)
    if (mp4Output) processArgs.splice(processArgs.length - 1, 0, '-fs', String(MAX_PROCESS_OUTPUT_BYTES))
    const stdout = await new Promise<Buffer>((resolve, reject) => {
      const child = spawn(command, processArgs, { stdio: ['ignore', 'pipe', 'pipe'] })
      const output: Buffer[] = []
      const errors: Buffer[] = []
      let outputBytes = 0
      let diagnosticBytes = 0
      let settled = false
      const timeout = setTimeout(() => {
        child.kill('SIGKILL')
        finish(new Error(`${outputLabel} timed out`))
      }, PROCESS_TIMEOUT_MS)

      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (error) reject(error)
        else resolve(Buffer.concat(output))
      }

      child.stdout.on('data', chunk => {
        outputBytes += chunk.length
        if (outputBytes > MAX_PROCESS_OUTPUT_BYTES) {
          child.kill('SIGKILL')
          finish(new Error(`${outputLabel} exceeded its output limit`))
        } else if (!settled) output.push(Buffer.from(chunk))
      })
      child.stderr.on('data', chunk => {
        if (diagnosticBytes < MAX_DIAGNOSTIC_BYTES) {
          const part = Buffer.from(chunk).subarray(0, MAX_DIAGNOSTIC_BYTES - diagnosticBytes)
          errors.push(part)
          diagnosticBytes += part.length
        }
      })
      child.on('error', error => {
        const processError: any = new Error(`${outputLabel} could not start: ${error.message}`)
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          processError.status = 503
          processError.code = 'MEDIA_TOOL_UNAVAILABLE'
        }
        finish(processError)
      })
      child.on('close', code => {
        if (code !== 0) {
          const detail = Buffer.concat(errors).toString('utf8').trim().slice(-500)
          finish(new Error(`${outputLabel} failed${detail ? `: ${detail}` : ` (exit ${code})`}`))
        } else {
          finish()
        }
      })
    })
    if (!mp4Output) return stdout
    const outputSize = (await stat(outputPath)).size
    if (!outputSize || outputSize >= MAX_PROCESS_OUTPUT_BYTES) throw new Error('Invalid optimized output size')
    return await readFile(outputPath)
  } finally {
    try {
      if (tempDir) await rm(tempDir, { recursive: true, force: true })
    } finally {
      releaseProcess()
    }
  }
}

export async function inspectVideo(input: Buffer) {
  assertMediaUploadSize('video/mp4', input.length)
  try {
    const output = await runProcess(
      'ffprobe',
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', 'pipe:0'],
      input, 'Video metadata inspection',
    )
    const metadata = JSON.parse(output.toString('utf8'))
    const streams = Array.isArray(metadata.streams) ? metadata.streams : []
    const video = streams.find(stream => stream.codec_type === 'video' && !stream.disposition?.attached_pic)
    if (!video || !video.codec_name || !Number.isSafeInteger(video.width) || !Number.isSafeInteger(video.height) ||
        video.width < 1 || video.height < 1 || video.width * video.height > 40_000_000) {
      throw new Error('Invalid video stream')
    }
    const durations = [metadata.format?.duration, ...streams.map(stream => stream.duration)]
      .map(Number).filter(value => Number.isFinite(value) && value > 0)
    const duration = durations.length ? Math.max(...durations) : NaN
    assertVideoDuration(duration)
    const detected = await fileTypeFromBuffer(input)
    if (!detected?.mime.startsWith('video/')) throw new Error('Invalid video container')
    return { duration, video, audio: streams.filter(stream => stream.codec_type === 'audio'), mimeType: detected.mime }
  } catch (error) {
    if (isMediaPolicyError(error)) throw error
    if (error?.code === 'MEDIA_TOOL_UNAVAILABLE') {
      throw new MediaPolicyError('OPTIMIZATION_FAILED', 'The video could not be optimized. Please try another video.', 503)
    }
    throw new MediaPolicyError('INVALID_VIDEO', 'This video could not be processed. Please try another video.')
  }
}

/** The only encoder configuration used by both raw playback and editor uploads. */
const DELIVERY_ENCODER_ARGS = [
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27',
  '-maxrate', '1600k', '-bufsize', '3200k', '-pix_fmt', 'yuv420p',
  '-threads', '2', '-c:a', 'aac', '-b:a', '96k',
  // Seekable output lets faststart preserve timestamps/edit lists; fragmented
  // empty_moov output can add B-frame preroll to the apparent video duration.
  '-movflags', '+faststart', '-f', 'mp4', 'pipe:1',
]

function alreadyDeliverySized(info, input: Buffer) {
  const bitrate = Number(info.video.bit_rate)
  return info.mimeType === 'video/mp4' && info.video.codec_name === 'h264' &&
    info.video.pix_fmt === 'yuv420p' && info.video.width <= 720 &&
    bitrate > 0 && bitrate <= 1_600_000 &&
    // AAC's reported average varies slightly around the 96k encoder target.
    info.audio.every(stream => stream.codec_name === 'aac' && Number(stream.bit_rate) > 0 && Number(stream.bit_rate) <= 110_000) &&
    input.length <= (info.duration * 1_696_000 / 8) * 1.15 + 64 * 1024
}

function streamFriendlyMp4(input: Buffer) {
  let offset = 0
  while (offset + 8 <= input.length) {
    let size = input.readUInt32BE(offset)
    const type = input.toString('ascii', offset + 4, offset + 8)
    if (size === 1) {
      if (offset + 16 > input.length) return false
      const extended = input.readBigUInt64BE(offset + 8)
      if (extended > BigInt(Number.MAX_SAFE_INTEGER)) return false
      size = Number(extended)
    }
    if (type === 'moov') return true
    if (type === 'mdat' || size < 8 || offset + size > input.length) return false
    offset += size
  }
  return false
}

async function encodeVideo(args: string[], input: Buffer) {
  try {
    const buffer = await runProcess('ffmpeg', args, input, 'Video optimization')
    if (!buffer.length) throw new Error('Empty encoder output')
    return buffer
  } catch (error) {
    if (isMediaPolicyError(error)) throw error
    throw new MediaPolicyError('OPTIMIZATION_FAILED', 'The video could not be optimized. Please try another video.')
  }
}

async function validateVideoDecode(input: Buffer) {
  const args = ['-hide_banner', '-loglevel', 'error', '-xerror', '-err_detect', 'explode',
    '-threads', '2', '-i', 'pipe:0', '-map', '0:v:0', '-map', '0:a?', '-f', 'null', '-']
  try { await runProcess('ffmpeg', args, input, 'Video validation') } catch (error) {
    if (isMediaPolicyError(error)) throw error
    if (error?.code === 'MEDIA_TOOL_UNAVAILABLE') {
      throw new MediaPolicyError('OPTIMIZATION_FAILED', 'The video could not be optimized. Please try another video.', 503)
    }
    throw new MediaPolicyError('INVALID_VIDEO', 'This video could not be processed. Please try another video.')
  }
}

/**
 * Creates a delivery-efficient H.264 MP4 without changing duration or aspect
 * ratio. It is used by the shared media store for new oversized uploads that
 * do not already pass through the Clip/Glimpse editor.
 */
export async function optimizePlaybackVideo(input: Buffer, inspected = null) {
  const previous = deliveryResults.get(input)
  if (previous && previous.checksum === createHash('sha256').update(input).digest('hex')) {
    return { buffer: input, sourceDuration: previous.sourceDuration, duration: previous.duration, optimizationStatus: previous.optimizationStatus }
  }
  const info = inspected || await inspectVideo(input)
  const sourceDuration = info.duration
  if (alreadyDeliverySized(info, input)) {
    // Fully decode before retaining an original; header metadata alone does not
    // establish that an apparently optimized file isn't truncated/corrupt.
    await validateVideoDecode(input)
    if (streamFriendlyMp4(input)) return rememberDelivery({ buffer: input, sourceDuration, duration: sourceDuration, optimizationStatus: 'original' })
    // A compliant video with a trailing moov atom only needs a lossless remux.
    const buffer = await encodeVideo(['-hide_banner', '-loglevel', 'error', '-xerror',
      '-i', 'pipe:0', '-map', '0:v:0', '-map', '0:a?', '-c', 'copy',
      '-movflags', '+faststart', '-f', 'mp4', 'pipe:1'], input)
    return rememberDelivery({ buffer, sourceDuration, duration: sourceDuration, optimizationStatus: 'remuxed' })
  }
  await validateVideoDecode(input)
  const args = [
    '-hide_banner', '-loglevel', 'error', '-xerror', '-err_detect', 'explode', '-threads', '2',
    '-i', 'pipe:0',
    '-map', '0:v:0',
    '-map', '0:a?',
    // Use the validated original duration, not a fixed 60s cut. This removes
    // codec-added tail padding without shortening the user's source.
    '-t', String(sourceDuration),
    '-vf', "scale='min(720,iw)':-2",
    ...DELIVERY_ENCODER_ARGS,
  ]
  const buffer = await encodeVideo(args, input)
  const output = await inspectVideo(buffer)
  return rememberDelivery({ buffer, sourceDuration, duration: output.duration, optimizationStatus: 'optimized' })
}

function filterGraph(filter: string, speed: number): string | undefined {
  const filters = [VIDEO_FILTERS[filter] || '', `setpts=PTS/${speed}`].filter(Boolean)
  return filters.length ? filters.join(',') : undefined
}

export async function processGlimpseVideo(input: Buffer, options: GlimpseVideoOptions) {
  // Always validate the complete original BEFORE any intentional editor trim.
  const info = await inspectVideo(input)
  const sourceDuration = info.duration
  const start = Math.max(0, Math.min(options.start, sourceDuration))
  const end = Math.max(0, Math.min(options.end, sourceDuration))
  const segmentDuration = end - start

  if (segmentDuration < 0.05) throw new Error('Choose a trim range longer than 0.05 seconds.')
  assertVideoDuration(segmentDuration / options.speed)
  if (![0.5, 1, 1.5, 2].includes(options.speed)) throw new Error('Unsupported playback speed.')
  if (!Object.prototype.hasOwnProperty.call(VIDEO_FILTERS, options.filter)) {
    throw new Error('Unsupported video filter.')
  }

  // Delivery videos are replayed from the feed, so even an otherwise unedited
  // camera upload receives the same bounded H.264 representation as edited
  // footage. Originals are not rewritten in-place: this applies only before a
  // new media row is created.
  const keepsOriginal = start === 0 && end === sourceDuration && options.speed === 1 && options.filter === 'none'
  if (keepsOriginal) {
    const optimized = await optimizePlaybackVideo(input, info)
    return {
      ...optimized,
      sourceDuration,
      start: 0,
      end: sourceDuration,
      duration: sourceDuration,
    }
  }

  // A valid selected segment must not hide corruption elsewhere in the file.
  await validateVideoDecode(input)
  const videoFilter = [
    filterGraph(options.filter, options.speed),
    // Do not upscale smaller recordings, but cap delivery playback at 720px
    // wide. This maintains aspect ratio and works across Android WebView and
    // browsers while avoiding oversized phone-camera uploads.
    "scale='min(720,iw)':-2",
  ].filter(Boolean).join(',')
  const args = [
    '-hide_banner', '-loglevel', 'error', '-xerror', '-err_detect', 'explode', '-threads', '2',
    '-ss', start.toFixed(3),
    '-i', 'pipe:0',
    '-t', (segmentDuration / options.speed).toFixed(3),
    '-map', '0:v:0',
    '-map', '0:a?',
  ]
  if (videoFilter) args.push('-vf', videoFilter)
  args.push(
    '-filter:a', `atempo=${options.speed}`,
    ...DELIVERY_ENCODER_ARGS,
  )

  const processed = await encodeVideo(args, input)
  const outputDuration = (await inspectVideo(processed)).duration
  return rememberDelivery({
    buffer: processed,
    sourceDuration,
    start,
    end,
    duration: outputDuration,
    optimizationStatus: 'optimized',
  })
}

export async function extractVideoCover(input: Buffer, time: number, filter: string): Promise<Buffer> {
  const videoFilter = VIDEO_FILTERS[filter]
  const args = [
    '-hide_banner', '-loglevel', 'error',
    '-i', 'pipe:0',
    '-ss', Math.max(0, time).toFixed(3),
    '-frames:v', '1',
  ]
  if (videoFilter) args.push('-vf', videoFilter)
  args.push('-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1')
  const cover = await runProcess('ffmpeg', args, input, 'Video cover extraction')
  if (cover.length === 0) throw new Error('Video cover extraction returned an empty image.')
  return cover
}