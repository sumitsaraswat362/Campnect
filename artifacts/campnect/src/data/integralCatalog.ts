import courseSource from './integralCourses.txt?raw'
import type { CourseOption } from './courseCatalog'

const courseLine = /^(.*?)\s*(?:—|--|-)\s*(\d+(?:\s*\+\s*\d+)?)\s+Years?\s*$/u

export const INTEGRAL_UNIVERSITY_COURSE_CATALOG: CourseOption[] = courseSource
  .split(/\r?\n/)
  .flatMap((line) => {
    const match = line.trim().match(courseLine)
    if (!match) return []

    const name = match[1].trim()
    const duration = match[2].replace(/\s+/g, '')
    return name ? [{ name, durationYears: `${duration} Years` }] : []
  })