import source from './cic-delhi-programmes.txt?raw'
import type { CourseOption } from './courseCatalog'

const catalog: CourseOption[] = []

for (const rawLine of source.split(/\r?\n/)) {
  const [name, rawDuration] = rawLine.split('|').map((value) => value.trim())
  if (!name || !rawDuration) continue

  const durationYears = rawDuration.replace(
    /^(\d+)(\+)? years?$/i,
    (_, years: string, plus: string | undefined) => `${years}${plus || ''} ${years === '1' ? 'Year' : 'Years'}`,
  )
  catalog.push({ name, durationYears })
}

export const CIC_DELHI_COURSE_CATALOG = catalog