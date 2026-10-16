interface MaintenanceScreenProps {
  message?: string
}

export function MaintenanceScreen({ message }: MaintenanceScreenProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        padding: '32px',
        textAlign: 'center',
        background: 'var(--color-bg, #09070F)',
        color: 'var(--color-text-primary, #F5F5F7)',
      }}
    >
      <div
        style={{
          width: '72px',
          height: '72px',
          borderRadius: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-lime-dim, rgba(187,255,0,0.14))',
        }}
      >
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
            stroke="var(--color-lime, #BBFF00)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '22px',
          fontWeight: 700,
          margin: 0,
        }}
      >
        Campnect is down for maintenance
      </h1>

      <p
        style={{
          maxWidth: '360px',
          fontSize: '15px',
          lineHeight: 1.5,
          color: 'var(--color-text-secondary, rgba(245,245,247,0.66))',
          margin: 0,
        }}
      >
        {message?.trim() || "We're making some improvements. We'll be back shortly — thanks for your patience."}
      </p>
    </div>
  )
}
