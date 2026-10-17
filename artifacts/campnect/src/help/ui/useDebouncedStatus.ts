import { useEffect, useState } from 'react'

export function useDebouncedStatus(message: string, delay = 500) {
  const [value, setValue] = useState('')
  useEffect(() => {
    const id = window.setTimeout(() => setValue(message), delay)
    return () => window.clearTimeout(id)
  }, [message, delay])
  return value
}
