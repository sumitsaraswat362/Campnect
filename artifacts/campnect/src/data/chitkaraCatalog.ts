import source from './chitkara-programmes.txt?raw'
import type { CourseOption } from './courseCatalog'

const catalog: CourseOption[] = []
const seen = new Set<string>()

for (const rawLine of source.split(/\r?\n/)) {
  const line = rawLine.trim()
  const separator = line.indexOf('—')
  if (!line || separator < 0) continue

  const name = line.slice(0, separator).trim()
  const rawDuration = line.slice(separator + 1).trim()
  if (!name || !rawDuration || seen.has(name)) continue

  const durationYears = rawDuration
    .replace(/^(\d+(?:\.\d+)?)(\+)? years?$/i, (_, years: string, plus: string | undefined) => `${years}${plus || ''} ${years === '1' ? 'Year' : 'Years'}`)
    .replace(/^(\d+(?:\.\d+)?)(\+)? year$/i, (_, years: string, plus: string | undefined) => `${years}${plus || ''} Year`)
  seen.add(name)
  catalog.push({ name, durationYears })
}

export const CHITKARA_COURSE_CATALOG = catalog