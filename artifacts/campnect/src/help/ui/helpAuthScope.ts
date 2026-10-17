import { useAuthStore } from '../../stores/authStore'
import { clearHelpVisitState } from '../helpVisitState'
import { normalizeHelpRole } from './helpRole'

export function helpOwnerKey(user: { id?: string; user_role?: string; account_type?: string } | null | undefined) {
  return user?.id ? `${user.id}:${normalizeHelpRole(user) ?? ''}` : undefined
}

// Registered once when the bundle imports Help, so logout from any screen clears the visit snapshot.
let lastKey = helpOwnerKey(useAuthStore.getState().user)
useAuthStore.subscribe((state) => {
  const key = helpOwnerKey(state.user)
  if (key !== lastKey) clearHelpVisitState()
  lastKey = key
})
