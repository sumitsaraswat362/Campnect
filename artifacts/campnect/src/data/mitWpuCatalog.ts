import source from './mit-wpu-programmes.txt?raw'
import type { CourseOption } from './courseCatalog'

const catalog: CourseOption[] = []
const seen = new Set<string>()

for (const rawLine of source.split(/\r?\n/)) {
  const line = rawLine.trim()
  const separator = line.indexOf('—')
  if (!line || separator < 0) continue

  const name = line.slice(0, separator).trim()
  const rawDuration = line.slice(separator + 1).trim()
  if (!name || !rawDuration || /COURSES & DURATION$/i.test(name) || seen.has(name)) continue

  const durationYears = rawDuration.replace(/^(\d+) years?$/i, '$1 Years').replace(/^(\d+) year$/i, '$1 Year')
  seen.add(name)
  catalog.push({ name, durationYears })
}

export const MIT_WPU_COURSE_CATALOG = catalog
