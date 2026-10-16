import type { NavigateFunction } from 'react-router-dom'
import { isRootTabPath } from '../utils/navigation.ts'

/**
 * Switches between the six canonical application roots. Root selection is
 * deliberately not a general navigation API: nested destinations retain
 * normal React Router push behavior at their callers.
 */
export function navigateToAppRoot(
  navigate: NavigateFunction,
  currentPath: string,
  root: string,
) {
  if (!isRootTabPath(root)) {
    throw new Error(`Invalid application root: ${root}`)
  }
  if (currentPath === root) return false
  navigate(root, { replace: true })
  return true
}