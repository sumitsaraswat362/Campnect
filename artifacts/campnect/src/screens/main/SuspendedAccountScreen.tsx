import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, LogOut, Send } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { Avatar } from '../../components/shared/Avatar'
import { useNavigate } from 'react-router-dom'
import { usersApi } from '../../api/users'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'

export function SuspendedAccountScreen() {
  const { user, logout, refreshUser } = useAuthStore()
  const navigate = useNavigate()
  const [appeal, setAppeal] = useState<any | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const loadAppeals = async () => {
    try {
      const response = await usersApi.getMyAppeals()
      setAppeal(response.data?.data?.[0] || null)
    } catch {
      setError('Unable to load your appeal status. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAppeals()
    const interval = window.setInterval(() => { void refreshUser() }, 15000)
    return () => window.clearInterval(interval)
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }
  const submitAppeal = async () => {
    if (!description.trim()) {
      setError('Please explain why you think the suspension was a mistake.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const response = await usersApi.submitAppeal(description.trim())
      setAppeal(response.data?.data)
      setShowForm(false)
      setDescription('')
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || 'We could not submit your appeal. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }
  const reason = user?.suspension_reason || 'A violation of Campnect rules was reported.'
  return (
    <div style={{ minHeight: '100dvh', background: '#050509', color: '#fff', padding: '52px 24px 28px', boxSizing: 'border-box', textAlign: 'center' }}>
      <div style={{ width: 96, height: 96, margin: '20px auto 24px', borderRadius: '50%', background: 'rgba(239,68,68,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {user?.avatar_url ? <Avatar src={user.avatar_url} name={user.full_name || user.username} size={96} /> : <AlertTriangle size={44} color="#EF4444" />}
      </div>
      <h1 style={{ fontSize: 30, lineHeight: 1.15, margin: '0 auto 12px', maxWidth: 330 }}>We suspended your account</h1>
      <p style={{ color: '#B5B2BF', fontSize: 16, lineHeight: 1.5, margin: '0 auto 28px' }}>{user?.full_name || user?.username}</p>
      <div style={{ textAlign: 'left', borderTop: '1px solid rgba(255,255,255,.14)', borderBottom: '1px solid rgba(255,255,255,.14)', padding: '20px 0', marginBottom: 28 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 19 }}>What this means</h2>
        <p style={{ margin: 0, color: '#B5B2BF', lineHeight: 1.55 }}>Your account is not visible to other people right now, and you cannot use Campnect while it is suspended.</p>
        <p style={{ margin: '16px 0 0', color: '#FCA5A5', lineHeight: 1.55 }}><strong>Reason:</strong> {reason}</p>
      </div>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '14px', color: '#B5B2BF' }}><Loader2 size={20} className="animate-spin" /></div>
      ) : appeal?.status === 'pending' || appeal?.status === 'assigned' || appeal?.status === 'under_review' ? (
        <div style={{ background: 'rgba(22,137,232,.12)', border: '1px solid rgba(22,137,232,.4)', borderRadius: 12, padding: '16px', textAlign: 'left', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}><CheckCircle2 size={18} color="#38BDF8" /> Your appeal is submitted</div>
          <p style={{ margin: '8px 0 0', color: '#B5B2BF', lineHeight: 1.5 }}>Our team will review it and let you know the outcome here.</p>
        </div>
      ) : appeal?.status === 'rejected' ? (
        <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.35)', borderRadius: 12, padding: '16px', textAlign: 'left', marginBottom: 12 }}>
          <strong>We reviewed your appeal</strong>
          <p style={{ margin: '8px 0 0', color: '#FECACA', lineHeight: 1.5 }}>{appeal.decision || 'Our decision remains the same.'}</p>
          <button onClick={() => { setShowForm(true); setError('') }} style={{ marginTop: 14, background: 'transparent', border: 'none', color: '#60A5FA', padding: 0, fontWeight: 700, cursor: 'pointer' }}>Submit another appeal</button>
        </div>
      ) : showForm ? (
        <div style={{ textAlign: 'left', background: '#0D0D14', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <label htmlFor="appeal-description" style={{ display: 'block', fontWeight: 800, marginBottom: 8 }}>Why was this a mistake?</label>
          <textarea id="appeal-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={10000} rows={5} placeholder="Tell us why you believe the suspension should be reviewed..." style={{ width: '100%', boxSizing: 'border-box', background: '#050509', color: '#fff', border: '1px solid rgba(255,255,255,.2)', borderRadius: 9, padding: 12, resize: 'vertical', font: 'inherit' }} />
          {error && <p style={{ color: '#FCA5A5', margin: '9px 0 0', fontSize: 14 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button onClick={() => setShowForm(false)} disabled={submitting} style={{ flex: 1, background: 'transparent', border: '1px solid rgba(255,255,255,.18)', color: '#fff', borderRadius: 9, padding: 11, fontWeight: 700 }}>Cancel</button>
            <button onClick={() => { void submitAppeal() }} disabled={submitting} style={{ flex: 1, background: '#1689E8', border: 'none', color: '#fff', borderRadius: 9, padding: 11, fontWeight: 800 }}>{submitting ? 'Submitting…' : 'Submit appeal'}</button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setShowForm(true); setError('') }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', background: '#1689E8', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 18px', fontWeight: 800, marginBottom: 12, cursor: 'pointer' }}><Send size={17} /> Appeal suspension</button>
      )}
      <button onClick={() => setShowLogoutConfirm(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,.18)', color: '#fff', borderRadius: 12, padding: '13px 18px', fontWeight: 700, cursor: 'pointer' }}><LogOut size={17} /> Log out</button>
      <ConfirmDialog
        open={showLogoutConfirm}
        title="Log out of Campnect?"
        message="You can sign in again whenever you’re ready."
        confirmLabel="Log out"
        cancelLabel="Stay signed in"
        onConfirm={() => { void handleLogout() }}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </div>
  )
}