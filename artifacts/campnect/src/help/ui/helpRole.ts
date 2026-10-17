export function normalizeHelpRole(user: { user_role?: string; account_type?: string } | null | undefined): string | undefined {
  const raw = (user?.user_role || user?.account_type || '').toLowerCase()
  if (!raw) return undefined
  return raw === 'teacher' || raw === 'faculty' ? 'faculty' : raw
}
