import { useEffect, useState } from 'react'
import { Search, UserMinus, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { usersApi } from '../../api/users'
import { Avatar } from '../../components/shared/Avatar'

type Person = { id: string; username: string; full_name: string; avatar_url?: string }

export function CloseMatesScreen() {
  const [mates, setMates] = useState<Person[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Person[]>([])

  useEffect(() => { usersApi.getCloseMates().then(r => setMates(r.data.data || [])).catch(() => {}) }, [])
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    const timer = window.setTimeout(() => usersApi.search(query.trim()).then(r => setResults(r.data.data || [])).catch(() => setResults([])), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  async function add(person: Person) {
    try { await usersApi.addCloseMate(person.id); setMates(prev => prev.some(x => x.id === person.id) ? prev : [...prev, person]); setQuery(''); setResults([]); toast.success(`${person.full_name} added to Close Mates`) }
    catch { toast.error('Could not update Close Mates') }
  }
  async function remove(person: Person) {
    try { await usersApi.removeCloseMate(person.id); setMates(prev => prev.filter(x => x.id !== person.id)) }
    catch { toast.error('Could not update Close Mates') }
  }

  return <div style={{ minHeight: '100%', padding: '20px 16px 32px', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
    <p style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-display)' }}>Close Mates</p>
    <p style={{ margin: '0 0 20px', color: 'var(--color-text-muted)', fontSize: 13 }}>Only people on this list can view your Close Mate stories.</p>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', borderRadius: 12, background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <Search size={17} color="var(--color-text-muted)" />
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search people to add" style={{ flex: 1, border: 0, outline: 0, background: 'transparent', color: 'var(--color-text-primary)', fontSize: 14 }} />
    </div>
    {results.length > 0 && <div style={{ marginTop: 8, borderRadius: 12, overflow: 'hidden', background: 'var(--color-surface)' }}>{results.map(person =>
      <PersonRow key={person.id} person={person} action={<UserPlus size={18} />} onClick={() => add(person)} />
    )}</div>}
    <p style={{ margin: '26px 0 10px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--color-text-muted)' }}>Your list · {mates.length}</p>
    {mates.length === 0 ? <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>No Close Mates yet.</p> : mates.map(person =>
      <PersonRow key={person.id} person={person} action={<UserMinus size={18} />} onClick={() => remove(person)} />
    )}
  </div>
}

function PersonRow({ person, action, onClick }: { person: Person; action: React.ReactNode; onClick: () => void }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 2px', borderBottom: '1px solid var(--color-border)' }}>
    <Avatar src={person.avatar_url} name={person.full_name} size={38} />
    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{person.full_name}</div><div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>@{person.username}</div></div>
    <button onClick={onClick} aria-label="Update Close Mates" style={{ border: 0, background: 'transparent', color: 'var(--color-lime)', padding: 8, cursor: 'pointer' }}>{action}</button>
  </div>
}