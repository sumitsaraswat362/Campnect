import { AppBackground }  from '../../components/layout/AppBackground'
import { ProgressDots }   from '../../components/ui/ProgressDots'
import { Button }         from '../../components/ui/Button'
import { typography }     from '../../styles/tokens'

interface SlideLayoutProps {
  children:  React.ReactNode
  step:      number
  total:     number
  onSkip:    () => void
  exiting:   boolean
  hideDots?: boolean
}

export function SlideLayout({
  children, step, total, onSkip, exiting, hideDots = false,
}: SlideLayoutProps) {
  const isLast = step === total - 1

  return (
    <AppBackground>
      <div
        style={{
          height:         '100%',
          minHeight:      '100%',
          overflowY:      'auto',
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          padding:        '24px 24px calc(40px + env(safe-area-inset-bottom, 0px))',
          opacity:        exiting ? 0 : 1,
          transform:      exiting ? 'translateY(-8px)' : 'translateY(0)',
          transition:     'opacity 0.22s ease, transform 0.22s ease',
        }}
      >
        {/* Top bar: Skip link */}
        <div style={{
          position:       'absolute',
          top:            0, left: 0, right: 0,
          display:        'flex',
          justifyContent: 'flex-end',
          padding:        '16px 20px',
          zIndex:         10,
        }}>
          {!isLast && (
            <Button variant="text" size="sm" onClick={onSkip}
              style={{ fontSize: typography.sizes.sm }}
            >
              Skip
            </Button>
          )}
        </div>

        {/* Slide content */}
        <div style={{ width: '100%', maxWidth: '400px' }}>
          {children}
        </div>

        {/* Bottom: Progress dots */}
        {!hideDots && (
          <div style={{
            position:   'fixed',
            bottom:     'calc(32px + env(safe-area-inset-bottom, 0px))',
            left:       0, right: 0,
            display:    'flex',
            justifyContent: 'center',
          }}>
            <ProgressDots total={total} current={step} />
          </div>
        )}
        {hideDots && (
          <div style={{ height: '64px' }} />
        )}
      </div>
    </AppBackground>
  )
}
