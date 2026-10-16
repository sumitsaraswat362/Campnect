interface VerifiedBadgeProps {
  size?: number
}

export function VerifiedBadge({ size = 14 }: VerifiedBadgeProps) {
  return (
    <img
      src="/verified-badge.png"
      alt="Verified"
      width={size}
      height={size}
      style={{
        flexShrink: 0,
        display: 'inline-block',
        objectFit: 'contain',
        verticalAlign: 'middle',
      }}
    />
  )
}
