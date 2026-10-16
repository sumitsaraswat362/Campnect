import React, { useState } from 'react'
import { CornerUpLeft, Pencil, Copy, Trash2, Pin, AlertTriangle, Flag } from 'lucide-react'
import { Message } from '../../stores/chatStore'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import { OPENMOJI_EMOJIS, openMojiAssetUrl } from '../../features/openmoji/catalog'

const QUICK_EMOJIS = ['2764', '1F602', '1F62E', '1F622', '1F44D', '1F525']

interface MessageActionsSheetProps {
  msg: Message
  isOwn: boolean
  onClose: () => void
  onReply: () => void
  onEdit?: () => void
  onDelete?: (forEveryone: boolean) => Promise<void> | void
  onCopy: () => void
  onReact: (emoji: string) => void
  onPin?: () => void
  onReport?: () => void
}

export function MessageActionsSheet({
  msg, isOwn, onClose, onReply, onEdit, onDelete, onCopy, onReact, onPin, onReport,
}: MessageActionsSheetProps) {
  const [confirmDeleteForEveryone, setConfirmDeleteForEveryone] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  useBackDismiss(true, () => {
    if (confirmDeleteForEveryone && !deleting) setConfirmDeleteForEveryone(false)
    else if (!deleting) onClose()
  }, confirmDeleteForEveryone ? 320 : 230)

  async function runDelete(forEveryone: boolean) {
    if (!onDelete || deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      await onDelete(forEveryone)
      onClose()
    } catch {
      setDeleteError('The message could not be deleted. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  if (confirmDeleteForEveryone) {
    return (
      <>
        <div onClick={() => { if (!deleting) setConfirmDeleteForEveryone(false) }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,18,27,0.46)', zIndex: 400, backdropFilter: 'blur(6px)' }} />
        <div style={{
          position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: '430px',
          zIndex: 401,
          background: '#ffffff',
          borderRadius: '28px 28px 0 0',
          border: '1px solid #eceef2',
          boxShadow: '0 -14px 48px rgba(24,31,47,0.18)',
          padding: '12px 18px calc(24px + env(safe-area-inset-bottom))',
          textAlign: 'center',
          animation: 'sheetUp 260ms cubic-bezier(0.34,1.2,0.64,1)',
        }}>
          <div style={{ width: 38, height: 4, borderRadius: 999, background: '#dfe3e9', margin: '0 auto 20px' }} />
          <div style={{ width: 56, height: 56, borderRadius: '18px', background: '#fff0f2', border: '1px solid #ffd5dc', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <AlertTriangle size={25} color="#d92d4c" />
          </div>
          <div style={{ color: '#d92d4c', fontSize: '10px', fontWeight: 900, letterSpacing: '.08em', marginBottom: 7 }}>DELETE MESSAGE</div>
          <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 800, color: '#171a22' }}>Delete for everyone?</h3>
          <p style={{ margin: '0 auto 18px', maxWidth: 330, fontSize: '14px', color: '#697180', lineHeight: 1.55 }}>
            This message will be removed for all participants and can't be undone.
          </p>
          {deleteError && <p role="alert" style={{ margin: '0 0 12px', padding: '10px 12px', borderRadius: 12, background: '#fff3f5', color: '#a72440', fontSize: 12, fontWeight: 700 }}>{deleteError}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              onClick={() => void runDelete(true)}
              disabled={deleting}
              style={{ width: '100%', minHeight: 50, padding: '13px', borderRadius: '15px', border: 'none', background: deleting ? '#f2a6b4' : '#d92d4c', color: '#ffffff', fontSize: '15px', fontWeight: 800, cursor: deleting ? 'wait' : 'pointer', boxShadow: deleting ? 'none' : '0 8px 20px rgba(217,45,76,.22)' }}
            >
              {deleting ? 'Deleting…' : 'Delete for everyone'}
            </button>
            <button
              onClick={() => setConfirmDeleteForEveryone(false)}
              disabled={deleting}
              style={{ width: '100%', minHeight: 48, padding: '13px', borderRadius: '15px', border: '1px solid #dfe3e9', background: '#ffffff', color: '#333946', fontSize: '15px', fontWeight: 700, cursor: deleting ? 'default' : 'pointer' }}
            >
              Keep message
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,18,27,0.42)', zIndex: 400, backdropFilter: 'blur(6px)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: '430px',
        zIndex: 401,
        background: '#ffffff',
        borderRadius: '28px 28px 0 0',
        border: '1px solid #eceef2',
        boxShadow: '0 -14px 48px rgba(24,31,47,0.18)',
        animation: 'sheetUp 260ms cubic-bezier(0.34,1.2,0.64,1)',
        paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
          <div style={{ width: 38, height: 4, borderRadius: 9999, background: '#dfe3e9' }} />
        </div>

        {/* Quick emoji reactions */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', padding: '8px 24px 14px', borderBottom: '1px solid #eceef2' }}>
          {QUICK_EMOJIS.map((emojiId) => {
            const emoji = OPENMOJI_EMOJIS.find((asset) => asset.id === emojiId)
            if (!emoji) return null
            return (
            <button
              key={emoji.id}
              onClick={() => { onReact(emoji.emoji); onClose() }}
              aria-label={`React with ${emoji.name}`}
              style={{ width: 36, height: 36, background: 'none', border: 'none', cursor: 'pointer', transition: 'transform 150ms', padding: '4px' }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.3)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <img src={openMojiAssetUrl(emoji.id)} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.removeAttribute('hidden') }} style={{ display: 'block', width: 28, height: 28, objectFit: 'contain' }} />
              <span hidden style={{ fontSize: 26 }}>{emoji.emoji}</span>
            </button>
            )
          })}
        </div>

        {/* Actions */}
        <div style={{ padding: '8px 0' }}>
          <ActionRow icon={<CornerUpLeft size={18} />} label="Reply" onClick={() => { onReply(); onClose() }} />
          <ActionRow icon={<Copy size={18} />} label="Copy text" onClick={() => { onCopy(); onClose() }} />
          {onPin && (
            <ActionRow icon={<Pin size={18} />} label={msg.is_pinned ? 'Unpin message' : 'Pin message'} onClick={() => { onPin(); onClose() }} />
          )}
          {isOwn && onEdit && msg.type === 'text' && (
            <ActionRow icon={<Pencil size={18} />} label="Edit message" onClick={() => { onEdit(); onClose() }} />
          )}
          {isOwn && onDelete && (
            <>
              <ActionRow icon={<Trash2 size={18} />} label="Delete for me" onClick={() => void runDelete(false)} danger />
              <ActionRow icon={<Trash2 size={18} />} label="Delete for everyone" onClick={() => setConfirmDeleteForEveryone(true)} danger />
            </>
          )}
          {!isOwn && onReport && (
            <ActionRow icon={<Flag size={18} />} label="Report message" onClick={() => { onReport(); onClose() }} danger />
          )}
        </div>
      </div>
    </>
  )
}

function ActionRow({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        width: '100%', background: 'none', border: 'none', cursor: 'pointer',
        padding: '13px 20px', color: danger ? '#d92d4c' : '#171a22',
        fontSize: '16px', fontWeight: 600, textAlign: 'left', WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ color: danger ? '#d92d4c' : '#697180' }}>{icon}</span>
      {label}
    </button>
  )
}
