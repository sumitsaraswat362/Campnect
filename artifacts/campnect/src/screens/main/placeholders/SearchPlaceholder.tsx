import { GlassCard } from '../../../components/ui/GlassCard'

export function SearchPlaceholder() {
  return (
    <div style={{ padding: '16px' }}>
      <GlassCard padding="20px">
        <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '6px' }}>🔍 Discover</p>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          Search for people, communities, events and more — coming in Task #5.
        </p>
      </GlassCard>
    </div>
  )
}
