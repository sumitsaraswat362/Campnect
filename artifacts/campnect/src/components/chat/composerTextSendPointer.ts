type PreventablePointerEvent = Pick<PointerEvent, 'preventDefault'>

/**
 * Keeps the textarea focused when activating the text-send button. Voice and
 * media actions intentionally retain their normal pointer behavior.
 */
export function preserveTextareaFocusOnTextSendPointerDown(
  event: PreventablePointerEvent,
  isTextSendActivation: boolean,
) {
  if (isTextSendActivation) event.preventDefault()
}