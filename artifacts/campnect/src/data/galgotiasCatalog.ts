import source from './galgotias-programmes.txt?raw'
import type { CourseOption } from './courseCatalog'

const excludedLines = new Set([
  'GALGOTIAS UNIVERSITY, GREATER NOIDA',
  'UNDERGRADUATE PROGRAMMES',
  'POSTGRADUATE PROGRAMMES',
  'DIPLOMA PROGRAMMES',
  'CERTIFICATE PROGRAMMES',
  'DOCTORAL PROGRAMMES',
])

const catalog: CourseOption[] = []
const seen = new Set<string>()

for (const rawLine of source.split(/\r?\n/)) {
  const line = rawLine.trim()
  if (!line || excludedLines.has(line) || /^[-=]+$/.test(line)) continue

  const separator = line.indexOf('—')
  const name = (separator >= 0 ? line.slice(0, separator) : line).trim()
  const durationYears = separator >= 0
    ? line.slice(separator + 1).trim()
    : /^Ph\.D\./.test(line)
      ? 'Research Programme'
      : ''

  if (!name || !durationYears || /^Ph\.D\. duration$/i.test(name) || seen.has(name)) continue
  seen.add(name)
  catalog.push({ name, durationYears })
}

export const GALGOTIAS_COURSE_CATALOG = catalog