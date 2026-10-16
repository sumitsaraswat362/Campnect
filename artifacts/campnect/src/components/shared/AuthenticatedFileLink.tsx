import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { useAuthMedia } from '../../hooks/useAuthMedia'
import { mediaUrl } from '../../utils/mediaUrl'

type AuthenticatedFileLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  src?: string | null
}

export function AuthenticatedFileLink({ src: rawSrc, onClick, children, ...anchorProps }: AuthenticatedFileLinkProps) {
  const { src, error } = useAuthMedia(mediaUrl(rawSrc))
  const unavailable = !src || error

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (unavailable) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }

  return (
    <a
      {...anchorProps}
      href={src ?? undefined}
      aria-disabled={unavailable}
      onClick={handleClick}
    >
      {children}
    </a>
  )
}