import React from 'react'
import { splitTextWithLinks, normalizeUrl } from '../../utils/linkify'

/** Renders message text with any URLs turned into real clickable links. */
export function TextWithLinks({ text, color }: { text: string; color: string }) {
  const segments = React.useMemo(() => splitTextWithLinks(text), [text])
  if (segments.length === 1 && !segments[0].isLink) return <>{text}</>
  return (
    <>
      {segments.map((segment, index) =>
        segment.isLink ? (
          <a
            key={index}
            href={normalizeUrl(segment.text)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            style={{ color, textDecoration: 'underline', wordBreak: 'break-all' }}
          >
            {segment.text}
          </a>
        ) : (
          <React.Fragment key={index}>{segment.text}</React.Fragment>
        ),
      )}
    </>
  )
}
