import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Send, CornerDownRight, MoreHorizontal, Pencil, Trash2, Check, Heart, Smile } from 'lucide-react'
import { Avatar } from '../shared/Avatar'
import { TimeAgo } from '../shared/TimeAgo'
import { postsApi } from '../../api/posts'
import { useAuthStore } from '../../stores/authStore'
import { CommentRowsSkeleton } from '../shared/AppSkeletons'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import { CommentModerationDialog } from '../shared/CommentModerationDialog'
import { useNavigate } from 'react-router-dom'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import { GiphyPicker } from '../chat/GiphyPicker'
import { parseGiphySelection, type GiphySelection } from '../../features/giphy/provider'
import {
  readCommentModerationPrompt,
  commentWarningCanBeConfirmed,
  type CommentModerationPrompt,
} from '../../features/comments/commentModeration'

interface PendingModeration {
  prompt: CommentModerationPrompt
  content: string
  parentId?: string
  commentId?: string
}

type CommentSubmissionResult = 'posted' | 'moderation' | 'failed'

interface Comment {
  id: string
  user_id: string
  username: string
  full_name: string
  avatar_url?: string
  content: string
  created_at: string
  parent_id?: string
  replies_count?: number | string
  replies?: Comment[]
  likes_count?: number | string
  is_liked?: boolean
}

interface CommentSheetProps {
  postId: string
  commentsCount: number
  onClose: () => void
  onCommentAdded: () => void
  onCommentDeleted?: () => void
}

export function CommentSheet({ postId, commentsCount, onClose, onCommentAdded, onCommentDeleted }: CommentSheetProps) {
  useBackDismiss(true, onClose, 200)
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Comment | null>(null)
  const [showMediaPicker, setShowMediaPicker] = useState(false)
  const [selectedGif, setSelectedGif] = useState<GiphySelection | null>(null)
  const [pendingModeration, setPendingModeration] = useState<PendingModeration | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const editingInputRef = useRef<HTMLInputElement>(null)
  const mountedRef = useRef(true)
  const currentPostIdRef = useRef(postId)
  currentPostIdRef.current = postId

  useEffect(() => {
    let cancelled = false

    async function loadComments() {
      setLoading(true)
      try {
        const response = await postsApi.getComments(postId)
        const topLevelComments: Comment[] = response.data.data || []
        const commentsWithReplies = await Promise.all(topLevelComments.map(async (comment) => {
          if (Number(comment.replies_count || 0) === 0) return comment
          try {
            const repliesResponse = await postsApi.getCommentReplies(postId, comment.id)
            return { ...comment, replies: repliesResponse.data.data || [] }
          } catch {
            return comment
          }
        }))
        if (!cancelled) setComments(commentsWithReplies)
      } catch {
        if (!cancelled) setComments([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    mountedRef.current = true
    void loadComments()
    return () => {
      cancelled = true
      mountedRef.current = false
    }
  }, [postId])

  useEffect(() => {
    if (replyTo) inputRef.current?.focus()
  }, [replyTo])

  async function handleSubmit() {
    if (!text.trim() || submitting) return
    await submitNewComment(text.trim(), replyTo?.id)
  }

  async function submitNewComment(
    content: string,
    parentId?: string,
    moderationConfirmation?: string,
  ): Promise<CommentSubmissionResult> {
    if (!content.trim() || submitting) return 'failed'
    setSubmitting(true)
    setSubmitError(null)
    try {
      const response = await postsApi.addComment(postId, content, parentId, moderationConfirmation)
      if (!mountedRef.current || currentPostIdRef.current !== postId) return 'failed'
      const newComment: Comment = response.data.data
      if (parentId) {
        setComments((cs) => cs.map((c) =>
          c.id === parentId
            ? { ...c, replies_count: Number(c.replies_count || 0) + 1, replies: [...(c.replies || []), newComment] }
            : c
        ))
      } else {
        setComments((cs) => [newComment, ...cs])
        onCommentAdded()
      }
      setText('')
      setReplyTo(null)
      setSelectedGif(null)
      setPendingModeration(null)
      return 'posted'
    } catch (error: any) {
      if (!mountedRef.current || currentPostIdRef.current !== postId) return 'failed'
      inputRef.current?.blur()
      const moderation = readCommentModerationPrompt(error?.response?.data)
      if (moderation) {
        setPendingModeration({
          prompt: moderation,
          content,
          ...(parentId ? { parentId } : {}),
        })
        setShowMediaPicker(false)
        return 'moderation'
      } else {
        setSubmitError(commentErrorMessage(error, parentId ? 'Reply' : 'Comment'))
        return 'failed'
      }
    } finally {
      if (mountedRef.current && currentPostIdRef.current === postId) setSubmitting(false)
    }
  }

  async function handleSendGiphy(selection: GiphySelection) {
    if (submitting) return
    setSelectedGif(selection)
    setSubmitError(null)
    const result = await submitNewComment(JSON.stringify(selection), replyTo?.id)
    if (!mountedRef.current || currentPostIdRef.current !== postId) return
    setShowMediaPicker(false)
    if (result !== 'moderation') window.setTimeout(() => inputRef.current?.focus(), 0)
  }

  function openExpressionPicker() {
    // The picker needs the space occupied by the IME on Android. Blurring first
    // prevents the keyboard from covering its tabs and search field.
    inputRef.current?.blur()
    setShowMediaPicker(true)
  }

  function startEditing(comment: Comment) {
    setOpenMenuId(null)
    setEditingId(comment.id)
    setEditingText(comment.content)
  }

  function updateDraftText(value: string) {
    setText(value)
    if (pendingModeration && !pendingModeration.commentId && pendingModeration.content !== value.trim()) {
      setPendingModeration(null)
    }
  }

  function updateEditDraft(value: string, commentId: string) {
    setEditingText(value)
    if (pendingModeration?.commentId === commentId && pendingModeration.content !== value.trim()) {
      setPendingModeration(null)
    }
  }

  function editPendingComment() {
    const editingComment = pendingModeration?.commentId
    setPendingModeration(null)
    if (editingComment) window.setTimeout(() => editingInputRef.current?.focus(), 0)
    else window.setTimeout(() => inputRef.current?.focus(), 0)
  }

  function dismissPendingComment() {
    const editingComment = pendingModeration?.commentId
    setPendingModeration(null)
    if (editingComment) window.setTimeout(() => editingInputRef.current?.focus(), 0)
    else window.setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function confirmPendingComment() {
    if (!pendingModeration || !commentWarningCanBeConfirmed(pendingModeration.prompt) || submitting) return
    const pending = pendingModeration
    if (pending.commentId) {
      const comment = findComment(comments, pending.commentId)
      if (comment) await saveEdit(comment, pending.content, pending.prompt.confirmationToken)
    } else {
      await submitNewComment(
        pending.content,
        pending.parentId,
        pending.prompt.confirmationToken,
      )
    }
  }

  function updateCommentTree(items: Comment[], commentId: string, content: string): Comment[] {
    return items.map((comment) => ({
      ...comment,
      ...(comment.id === commentId ? { content } : {}),
      replies: comment.replies ? updateCommentTree(comment.replies, commentId, content) : comment.replies,
    }))
  }

  function removeCommentTree(items: Comment[], commentId: string): Comment[] {
    return items
      .filter((comment) => comment.id !== commentId)
      .map((comment) => ({
        ...comment,
        replies: comment.replies ? removeCommentTree(comment.replies, commentId) : comment.replies,
      }))
  }

  function updateCommentLikeTree(items: Comment[], commentId: string, isLiked: boolean, likesCount: number): Comment[] {
    return items.map((comment) => ({
      ...comment,
      ...(comment.id === commentId ? { is_liked: isLiked, likes_count: likesCount } : {}),
      replies: comment.replies ? updateCommentLikeTree(comment.replies, commentId, isLiked, likesCount) : comment.replies,
    }))
  }

  function findComment(items: Comment[], commentId: string): Comment | undefined {
    for (const comment of items) {
      if (comment.id === commentId) return comment
      const reply = comment.replies && findComment(comment.replies, commentId)
      if (reply) return reply
    }
    return undefined
  }

  function commentErrorMessage(error: any, action: string): string {
    if (error?.response?.data?.code === 'COMMENT_SPAM') {
      return error.response.data.error || 'You’re commenting too quickly. Please wait a moment and try again.'
    }
    return error?.response?.data?.error || `${action} could not be completed. Please try again.`
  }

  async function toggleCommentLike(comment: Comment) {
    if (actionBusyId) return
    const wasLiked = Boolean(comment.is_liked)
    const previousCount = Number(comment.likes_count || 0)
    const nextLiked = !wasLiked
    const nextCount = Math.max(0, previousCount + (nextLiked ? 1 : -1))
    setActionBusyId(comment.id)
    setComments((items) => updateCommentLikeTree(items, comment.id, nextLiked, nextCount))
    try {
      const response = nextLiked
        ? await postsApi.likeComment(comment.id)
        : await postsApi.unlikeComment(comment.id)
      const data = response.data.data
      setComments((items) => updateCommentLikeTree(items, comment.id, Boolean(data.is_liked), Number(data.likes_count || 0)))
    } catch {
      setComments((items) => updateCommentLikeTree(items, comment.id, wasLiked, previousCount))
    } finally {
      setActionBusyId(null)
    }
  }

  async function saveEdit(comment: Comment, submittedContent = editingText.trim(), moderationConfirmation?: string) {
    const content = submittedContent
    if (!content || actionBusyId) return
    setActionBusyId(comment.id)
    try {
      await postsApi.updateComment(comment.id, content, moderationConfirmation)
      if (!mountedRef.current) return
      setComments((items) => updateCommentTree(items, comment.id, content))
      setEditingId(null)
      setEditingText('')
      setPendingModeration(null)
    } catch (error: any) {
      if (!mountedRef.current || currentPostIdRef.current !== postId) return
      const moderation = readCommentModerationPrompt(error?.response?.data)
      if (moderation) {
        editingInputRef.current?.blur()
        setPendingModeration({ prompt: moderation, content, commentId: comment.id })
      } else {
        setSubmitError(commentErrorMessage(error, 'Comment edit'))
      }
      // Keep the editor open so the user can retry without losing their text.
    } finally {
      if (mountedRef.current && currentPostIdRef.current === postId) setActionBusyId(null)
    }
  }

  function requestDelete(comment: Comment) {
    setOpenMenuId(null)
    if (actionBusyId) return
    setDeleteTarget(comment)
  }

  async function deleteComment(comment: Comment) {
    setActionBusyId(comment.id)
    try {
      await postsApi.deleteComment(comment.id)
      setComments((items) => removeCommentTree(items, comment.id))
      if (!comment.parent_id) onCommentDeleted?.()
      setDeleteTarget(null)
    } catch {
      // Keep the comment visible when the server rejects the deletion.
    } finally {
      setActionBusyId(null)
    }
  }

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, backdropFilter: 'blur(4px)' }}
      />

      {/* Sheet */}
      <div
        style={{
          position: 'fixed', left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: '430px',
            bottom: 'max(0px, var(--keyboard-offset, 0px))', zIndex: 201,
          background: 'var(--color-bg)',
          backdropFilter: 'none', WebkitBackdropFilter: 'none',
          borderRadius: '20px 20px 0 0',
          border: '1px solid var(--color-border)',
          boxShadow: '0 -4px 48px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07)',
          // `--keyboard-offset` only moves a sheet when the WebView has not
          // already resized. Size against the actual remaining visible canvas
          // instead; subtracting that offset here as well collapses the sheet
          // above the keyboard on affected Android WebViews.
          height: 'min(620px, 80svh, var(--visual-viewport-height, 100svh), calc(var(--stable-viewport-height, 100svh) - var(--keyboard-height, 0px)))',
          maxHeight: 'min(620px, 80svh, var(--visual-viewport-height, 100svh), calc(var(--stable-viewport-height, 100svh) - var(--keyboard-height, 0px)))',
          minHeight: 0,
          display: 'flex', flexDirection: 'column',
          animation: 'sheetUp 260ms cubic-bezier(0.34,1.2,0.64,1)',
        }}
      >
        {/* Handle + header */}
        <div style={{ flexShrink: 0, padding: '12px 16px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '9999px', background: 'var(--color-border-strong)' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Comments {commentsCount > 0 ? `(${commentsCount})` : ''}
            </span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Comment list */}
        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {loading ? (
            <CommentRowsSkeleton />
          ) : comments.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px', padding: '24px' }}>
              Be the first to comment
            </p>
          ) : (
            comments.map((c) => (
              <CommentRow
                key={c.id}
                comment={c}
                isOwner={c.user_id === user?.id}
                currentUserId={user?.id}
                editingId={editingId}
                editingText={editingText}
                onEditTextChange={(value, commentId) => updateEditDraft(value, commentId)}
                editingInputRef={editingInputRef}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                actionBusyId={actionBusyId}
                onStartEdit={startEditing}
                onSaveEdit={saveEdit}
                onCancelEdit={() => { setEditingId(null); setEditingText('') }}
                onDelete={requestDelete}
                 onReply={setReplyTo}
                 onToggleLike={toggleCommentLike}
                onNavigate={(un) => { onClose(); navigate(`/app/profile/${un}`) }}
              />
            ))
          )}
        </div>

        {/* Reply banner */}
        {replyTo && (
          <div style={{ padding: '8px 16px', background: 'var(--color-surface-hover)', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--color-text-accent)', fontWeight: 600 }}>
              <CornerDownRight size={14} />
              Replying to @{replyTo.username?.toLowerCase()}
            </span>
            <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex' }}>
              <X size={14} />
            </button>
          </div>
        )}

        {selectedGif && (
          <div role="status" aria-label="GIF selected and ready to comment" style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '7px 16px',
            background: 'var(--color-surface-hover)', borderTop: '1px solid var(--color-border)',
          }}>
            <img
              src={selectedGif.renditionUrl}
              alt={selectedGif.altText || 'Selected GIF'}
              style={{ width: 56, height: 42, objectFit: 'cover', borderRadius: 8 }}
            />
            <span style={{ flex: 1, minWidth: 0, color: 'var(--color-text-secondary)', fontSize: 12 }}>
              GIF selected · ready to post
            </span>
            <button type="button" aria-label="Remove selected GIF" onClick={() => {
              setSelectedGif(null)
              if (pendingModeration && !pendingModeration.commentId) setPendingModeration(null)
            }} style={{ border: 0, background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
              <X size={17} />
            </button>
          </div>
        )}

        {submitError && (
          <div role="alert" style={{ padding: '7px 16px 0', color: '#EF4444', fontSize: '12px', background: 'var(--glass-2)' }}>
            {submitError}
          </div>
        )}

        {/* Input */}
        <div style={{ flexShrink: 0, padding: '10px 16px', display: 'flex', gap: '10px', alignItems: 'center', background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)', paddingBottom: 'calc(16px + max(var(--native-safe-bottom, 0px), env(safe-area-inset-bottom, 0px)))' }}>
          <Avatar src={user?.avatar_url} name={user?.full_name} size={32} />
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => updateDraftText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
            disabled={submitting}
              placeholder={replyTo ? `Reply to @${replyTo.username?.toLowerCase()}…` : 'Add a comment…'}
            style={{
              flex: 1, minWidth: 0, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '9999px',
              padding: '10px 16px', color: 'var(--color-text-primary)', fontSize: '14px', fontFamily: 'var(--font-family)', outline: 'none',
            }}
          />
            <button
              type="button"
              aria-label="Open emoji, sticker, and GIF picker"
              onClick={openExpressionPicker}
              disabled={submitting}
              style={{ background: 'none', border: 'none', padding: '5px', color: 'var(--color-text-muted)', cursor: submitting ? 'wait' : 'pointer', display: 'flex', flexShrink: 0 }}
            >
              <Smile size={20} />
            </button>
            <button
            aria-label="Post"
            onClick={handleSubmit}
            disabled={!text.trim() || submitting}
            style={{ background: text.trim() ? 'linear-gradient(135deg, #18181B, #C44DCC)' : 'var(--color-surface)', border: 'none', borderRadius: '9999px', width: '36px', height: '36px', cursor: text.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 200ms' }}
          >
            <Send size={16} color={text.trim() ? '#fff' : 'var(--color-text-muted)'} />
          </button>
        </div>
        {showMediaPicker && (
          <GiphyPicker
            initialMode="emoji"
            onClose={() => setShowMediaPicker(false)}
            onEmojiSelect={(emoji) => {
              setText((current) => `${current}${emoji}`)
              setShowMediaPicker(false)
              window.setTimeout(() => inputRef.current?.focus(), 0)
            }}
            onGiphySelect={(selection) => { void handleSendGiphy(selection) }}
          />
        )}
      </div>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete comment?"
        message="This comment will be removed from the conversation."
        confirmLabel="Delete"
        cancelLabel="Keep it"
        destructive
        busy={Boolean(deleteTarget && actionBusyId === deleteTarget.id)}
        onCancel={() => { if (!actionBusyId) setDeleteTarget(null) }}
        onConfirm={() => { if (deleteTarget) void deleteComment(deleteTarget) }}
      />
      <CommentModerationDialog
        open={Boolean(pendingModeration)}
        prompt={pendingModeration?.prompt ?? null}
        busy={submitting || Boolean(pendingModeration?.commentId && actionBusyId === pendingModeration.commentId)}
        onEdit={editPendingComment}
        onConfirm={() => { void confirmPendingComment() }}
        onCancel={dismissPendingComment}
      />
    </>,
    document.body,
  )
}

interface CommentRowProps {
  comment: Comment
  isOwner: boolean
  currentUserId?: string
  editingId: string | null
  editingText: string
  onEditTextChange: (value: string, commentId: string) => void
  editingInputRef: React.RefObject<HTMLInputElement | null>
  openMenuId: string | null
  setOpenMenuId: (id: string | null) => void
  actionBusyId: string | null
  onStartEdit: (comment: Comment) => void
  onSaveEdit: (comment: Comment) => void
  onCancelEdit: () => void
  onDelete: (comment: Comment) => void
  onReply: (comment: Comment) => void
  onToggleLike: (comment: Comment) => void
  onNavigate: (username: string) => void
  depth?: number
  parentUsername?: string
}

function CommentRow({
  comment,
  isOwner,
  currentUserId,
  editingId,
  editingText,
  onEditTextChange,
  editingInputRef,
  openMenuId,
  setOpenMenuId,
  actionBusyId,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onReply,
  onToggleLike,
  onNavigate,
  depth = 0,
  parentUsername,
}: CommentRowProps) {
  const editing = editingId === comment.id
  const busy = actionBusyId === comment.id
  const isReply = depth > 0
  const giphy = parseGiphySelection(comment.content)

  return (
    <div style={isReply ? {
      marginTop: '10px',
      marginLeft: '40px',
      paddingLeft: '12px',
      borderLeft: '2px solid var(--color-border-strong)',
    } : undefined}>
      <div style={{ display: 'flex', gap: '10px' }}>
        <Avatar src={comment.avatar_url} name={comment.full_name} size={isReply ? 28 : 32} onClick={() => onNavigate(comment.username)} />
        <div style={{ flex: 1 }}>
          <div style={{ position: 'relative', background: isReply ? 'var(--color-surface-hover)' : 'var(--color-surface)', borderRadius: '12px', padding: '8px 12px' }}>
            {isReply && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px', color: 'var(--color-text-muted)', fontSize: '11px', fontWeight: 600 }}>
                <CornerDownRight size={12} />
                Reply to @{parentUsername?.toLowerCase()}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span
                  onClick={() => onNavigate(comment.username)}
                  style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', cursor: 'pointer' }}
                >
                  {comment.full_name}
                </span>
                {' '}
                {editing ? (
                  <input
                    ref={editingInputRef}
                    autoFocus
                    value={editingText}
                    maxLength={2000}
                    onChange={(e) => onEditTextChange(e.target.value, comment.id)}
                    disabled={busy}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); void onSaveEdit(comment) }
                      if (e.key === 'Escape') onCancelEdit()
                    }}
                    style={{
                      width: '100%', boxSizing: 'border-box', marginTop: '6px',
                      background: 'var(--color-bg)', border: '1px solid var(--color-border-strong)',
                      borderRadius: '8px', padding: '7px 8px', color: 'var(--color-text-primary)',
                      fontSize: '14px', outline: 'none',
                    }}
                  />
                ) : giphy ? (
                  <div style={{ marginTop: '6px', maxWidth: '220px' }}>
                    <img
                      src={giphy.renditionUrl}
                      alt={giphy.altText || 'GIF from GIPHY'}
                      loading="lazy"
                      style={{ display: 'block', width: '100%', maxHeight: '220px', objectFit: 'contain', borderRadius: '8px' }}
                    />
                    {giphy.creatorName && (
                      <span style={{ display: 'block', marginTop: '4px', fontSize: '10px', color: 'var(--color-text-muted)' }}>
                        {giphy.creatorUrl ? <a href={giphy.creatorUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>@{giphy.creatorName} · GIPHY</a> : `@${giphy.creatorName} · GIPHY`}
                      </span>
                    )}
                  </div>
                ) : (
                  <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)', wordBreak: 'break-word' }}>
                    {comment.content}
                  </span>
                )}
              </div>
              {isOwner && (
                <button
                  aria-label={`Actions for ${comment.full_name}'s comment`}
                  onClick={() => setOpenMenuId(openMenuId === comment.id ? null : comment.id)}
                  disabled={busy}
                  style={{ flexShrink: 0, background: 'none', border: 'none', padding: '2px', color: 'var(--color-text-muted)', cursor: busy ? 'wait' : 'pointer', display: 'flex' }}
                >
                  <MoreHorizontal size={17} />
                </button>
              )}
            </div>
            {editing && (
              <div style={{ display: 'flex', gap: '10px', marginTop: '7px' }}>
                <button onClick={() => void onSaveEdit(comment)} disabled={!editingText.trim() || busy} style={commentActionStyle(true)}>
                  <Check size={13} /> {busy ? 'Saving…' : 'Save'}
                </button>
                <button onClick={onCancelEdit} disabled={busy} style={commentActionStyle(false)}>Cancel</button>
              </div>
            )}
            {isOwner && openMenuId === comment.id && !editing && (
              <div style={{
                position: 'absolute', top: '30px', right: '8px', zIndex: 3,
                minWidth: '128px', padding: '5px', borderRadius: '10px',
                background: 'var(--color-bg)', border: '1px solid var(--color-border-strong)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
              }}>
                {!giphy && (
                  <button onClick={() => onStartEdit(comment)} style={menuActionStyle}>
                    <Pencil size={14} /> Edit
                  </button>
                )}
                <button onClick={() => void onDelete(comment)} style={{ ...menuActionStyle, color: '#EF4444' }}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '4px', paddingLeft: '4px' }}>
            <TimeAgo date={comment.created_at} />
            <button
              aria-label={comment.is_liked ? 'Unlike comment' : 'Like comment'}
              aria-pressed={Boolean(comment.is_liked)}
              onClick={() => void onToggleLike(comment)}
              disabled={busy}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'none', border: 'none', cursor: busy ? 'wait' : 'pointer', color: comment.is_liked ? '#EF4444' : 'var(--color-text-muted)', fontSize: '12px', padding: 0, fontWeight: 500 }}
            >
              <Heart size={13} fill={comment.is_liked ? 'currentColor' : 'none'} />
              {Number(comment.likes_count || 0) > 0 ? Number(comment.likes_count) : 'Like'}
            </button>
            {!isReply && (
              <button onClick={() => onReply(comment)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '12px', padding: 0, fontWeight: 500 }}>
                Reply
              </button>
            )}
          </div>
        </div>
      </div>
      {comment.replies?.map((reply) => (
        <CommentRow
          key={reply.id}
          comment={reply}
          isOwner={reply.user_id === currentUserId}
          currentUserId={currentUserId}
          editingId={editingId}
          editingText={editingText}
          onEditTextChange={onEditTextChange}
          editingInputRef={editingInputRef}
          openMenuId={openMenuId}
          setOpenMenuId={setOpenMenuId}
          actionBusyId={actionBusyId}
          onStartEdit={onStartEdit}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          onDelete={onDelete}
          onReply={onReply}
          onToggleLike={onToggleLike}
          onNavigate={onNavigate}
          depth={depth + 1}
          parentUsername={comment.username}
        />
      ))}
    </div>
  )
   }

const menuActionStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  padding: '8px 9px',
  border: 'none',
  borderRadius: '7px',
  background: 'none',
  color: 'var(--color-text-primary)',
  fontSize: '13px',
  textAlign: 'left',
  cursor: 'pointer',
}

const commentActionStyle = (primary: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  border: 'none',
  borderRadius: '7px',
  padding: '5px 8px',
  background: primary ? 'var(--color-lime)' : 'var(--color-surface-hover)',
  color: primary ? 'var(--color-bg)' : 'var(--color-text-secondary)',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
})
