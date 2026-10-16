import React, { useState, useRef } from 'react'
import { Upload, CheckCircle, Clock, Image as ImageIcon, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { AppBackground } from '../../components/layout/AppBackground'
import { GlassCard } from '../../components/ui/GlassCard'
import { Button } from '../../components/ui/Button'
import { useAuthStore } from '../../stores/authStore'
import client from '../../api/client'
import { createLocalMediaPreview, disposeLocalMediaPreview } from '../../utils/localMediaPreview'
import { mediaUploadError } from '../../utils/mediaUploadPolicy'

type UploadSlot = {
  id: 'id_photo' | 'selfie'
  label: string
  hint: string
  icon: React.ReactNode
}

const SLOTS: UploadSlot[] = [
  { id: 'id_photo', label: 'College ID Card',    hint: 'Front of your student ID',         icon: <ImageIcon size={28} /> },
  { id: 'selfie',   label: 'Selfie holding ID',  hint: 'Hold your ID next to your face',   icon: <Upload    size={28} /> },
]

type VerifyState = 'upload' | 'uploading' | 'pending'

function isPendingOrApproved(status?: string) {
  return status === 'pending' || status === 'approved'
}

export function VerifyCollegeScreen() {
  const { user, setVerificationStatus, refreshUser } = useAuthStore()

  // Derive initial UI mode from persisted store so state survives page refresh
  // and re-login: a user who already submitted must see "Under Review", not the upload form.
  const initialState: VerifyState = isPendingOrApproved(user?.verification_status) ? 'pending' : 'upload'

  const [files,    setFiles]    = useState<{ id_photo?: File; selfie?: File }>({})
  const [previews, setPreviews] = useState<{ id_photo?: string; selfie?: string }>({})
  const [dragging, setDragging] = useState<string | null>(null)
  const [state,    setState]    = useState<VerifyState>(initialState)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  async function handleFileSelect(slot: UploadSlot['id'], file: File) {
    if (!file.type.startsWith('image/')) { toast.error('Please upload an image file'); return }
    const validationError = await mediaUploadError(file, 'image')
    if (validationError) { toast.error(validationError); return }
    let url: string
    try {
      url = await createLocalMediaPreview(file)
    } catch {
      toast.error('That image could not be previewed. Choose another image.')
      return
    }
    setFiles((f)    => ({ ...f,    [slot]: file }))
    setPreviews((p) => {
      disposeLocalMediaPreview(p[slot])
      return { ...p, [slot]: url }
    })
  }

  function removeFile(slot: UploadSlot['id']) {
    setFiles((f)    => { const c = { ...f };    delete c[slot]; return c })
    setPreviews((p) => {
      disposeLocalMediaPreview(p[slot])
      const c = { ...p }
      delete c[slot]
      return c
    })
  }

  async function handleSubmit() {
    if (!files.id_photo || !files.selfie) { toast.error('Please upload both photos'); return }
    for (const file of [files.id_photo, files.selfie]) {
      const error = await mediaUploadError(file, 'image')
      if (error) { toast.error(error); return }
    }
    setState('uploading')
    try {
      const formData = new FormData()
      formData.append('id_photo', files.id_photo)
      formData.append('selfie',   files.selfie)
      await client.post('/auth/college-verify', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      // Persist pending status so it survives refresh/re-login
      setVerificationStatus({ verificationStatus: 'pending' })
      await refreshUser()
      setState('pending')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Upload failed')
      setState('upload')
    }
  }

  // ─── Pending / Under Review state ─────────────────────────────────────────
  if (state === 'pending') {
    return (
      <AppBackground>
        <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '24px', background: 'linear-gradient(135deg, rgba(24,24,27,0.30), rgba(196,77,204,0.18))', border: '1px solid rgba(63,63,70,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', boxShadow: '0 0 40px rgba(24,24,27,0.30)' }}>
            <Clock size={36} color="rgba(210,210,215,0.90)" />
          </div>

          <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '8px', textAlign: 'center' }}>
            Under Review
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', textAlign: 'center', marginBottom: '32px', maxWidth: '320px', lineHeight: 1.6 }}>
            Our team is verifying your student status. You'll be notified within{' '}
            <strong style={{ color: 'var(--color-text-primary)' }}>24 hours</strong>.
          </p>

          <GlassCard style={{ width: '100%', maxWidth: '380px' }} padding="24px">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { icon: '✅', text: 'Photos submitted successfully' },
                { icon: '🔍', text: 'Manual review in progress'     },
                { icon: '🔔', text: 'Notification once approved'    },
              ].map((item) => (
                <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '20px' }}>{item.icon}</span>
                  <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>{item.text}</span>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* No "Continue to app" button — ProtectedRoute blocks access until approved.
              Once approved, refreshUser() will update isCollegeVerified and let them in. */}
          <p style={{ marginTop: '24px', fontSize: '13px', color: 'var(--color-text-muted)', textAlign: 'center', maxWidth: '280px', lineHeight: 1.5 }}>
            You'll be automatically redirected once your account is approved.
          </p>
        </div>
      </AppBackground>
    )
  }

  // ─── Upload form ───────────────────────────────────────────────────────────
  return (
    <AppBackground>
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
        <div style={{ marginBottom: '28px', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'linear-gradient(135deg, rgba(24,24,27,0.30), rgba(196,77,204,0.18))', border: '1px solid rgba(63,63,70,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 0 30px rgba(24,24,27,0.25)' }}>
            <CheckCircle size={30} color="rgba(210,210,215,0.90)" />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
            Verify your student status
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', maxWidth: '300px', lineHeight: 1.5 }}>
            Upload two photos to get your verified badge. All data is kept private and secure.
          </p>
        </div>

        <GlassCard style={{ width: '100%', maxWidth: '420px' }} padding="24px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {SLOTS.map((slot) => (
              <div key={slot.id}>
                <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                  {slot.label}
                </p>
                {previews[slot.id] ? (
                  <div style={{ position: 'relative', borderRadius: '14px', overflow: 'hidden', border: '1.5px solid rgba(63,63,70,0.70)' }}>
                    <img src={previews[slot.id]} alt={slot.label} style={{ width: '100%', height: '160px', objectFit: 'cover' }} />
                    <button
                      onClick={() => removeFile(slot.id)}
                      style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '9999px', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-primary)' }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRefs.current[slot.id]?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragging(slot.id) }}
                    onDragLeave={() => setDragging(null)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragging(null)
                      const file = e.dataTransfer.files[0]
                      if (file) handleFileSelect(slot.id, file)
                    }}
                    style={{
                      height: '130px',
                      borderRadius: '14px',
                      border: `1.5px dashed ${dragging === slot.id ? 'rgba(63,63,70,0.70)' : 'rgba(255,255,255,0.14)'}`,
                      background: dragging === slot.id ? 'rgba(24,24,27,0.08)' : 'rgba(255,255,255,0.03)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      cursor: 'pointer', transition: 'all 200ms',
                    }}
                  >
                    <span style={{ color: 'var(--color-text-muted)' }}>{slot.icon}</span>
                    <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{slot.hint}</span>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Tap or drag & drop</span>
                  </div>
                )}
                <input
                  ref={(el) => { fileInputRefs.current[slot.id] = el }}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(slot.id, f) }}
                />
              </div>
            ))}

            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: 1.5, textAlign: 'center' }}>
              🔒 Your photos are encrypted and only seen by our verification team
            </p>

            <Button
              fullWidth
              onClick={handleSubmit}
              disabled={!files.id_photo || !files.selfie || state === 'uploading'}
            >
              {state === 'uploading' ? 'Uploading…' : 'Submit for verification'}
            </Button>
          </div>
        </GlassCard>
      </div>
    </AppBackground>
  )
}
