export interface ExternalHelpLink {
  title: string
  url?: string
}

function configuredUrl(value: string | undefined) {
  const url = value?.trim()
  return url && /^(https?:|mailto:)/i.test(url) ? url : undefined
}

function legalPortalUrl(path: string) {
  const configuredOrigin = configuredUrl(import.meta.env.VITE_LEGAL_PORTAL_ORIGIN)
  if (configuredOrigin?.startsWith('http')) {
    return new URL(path, configuredOrigin.endsWith('/') ? configuredOrigin : `${configuredOrigin}/`).toString()
  }

  // Keep consent and help links on Campnect's public Legal portal. A configured
  // origin may still override this for a dedicated environment.
  return new URL(path, 'https://legal-campnect.perinol.com').toString()
}

export const legalLinks: ExternalHelpLink[] = [
  { title: 'Privacy Policy', url: configuredUrl(import.meta.env.VITE_PRIVACY_POLICY_URL) || legalPortalUrl('/privacy') },
  { title: 'Terms of Service', url: configuredUrl(import.meta.env.VITE_TERMS_OF_SERVICE_URL) || legalPortalUrl('/terms') },
  { title: 'Community Guidelines', url: configuredUrl(import.meta.env.VITE_COMMUNITY_GUIDELINES_URL) || legalPortalUrl('/community-guidelines') },
  { title: 'Cookie Policy', url: configuredUrl(import.meta.env.VITE_COOKIE_POLICY_URL) || legalPortalUrl('/cookies') },
]

export const supportContactUrl = configuredUrl(import.meta.env.VITE_SUPPORT_CONTACT_URL)