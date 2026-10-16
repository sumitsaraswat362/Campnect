import { GlassCard } from '../../../components/ui/GlassCard'

export function ReelsPlaceholder() {
  return (
    <div style={{ padding: '16px' }}>
      <GlassCard padding="20px">
        <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '6px' }}>Glimpse</p>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          Short-form video content from your campus — coming soon.
        </p>
      </GlassCard>
    </div>
  )
}
