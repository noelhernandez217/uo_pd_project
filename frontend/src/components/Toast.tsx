import { useEffect, useState } from 'react'

export interface ToastMessage {
  id: number
  text: string
  type: 'info' | 'warning' | 'critical'
}

let toastId = 0
type Listener = (msg: ToastMessage) => void
const listeners: Listener[] = []

export function fireToast(text: string, type: ToastMessage['type'] = 'info') {
  const msg: ToastMessage = { id: ++toastId, text, type }
  listeners.forEach((l) => l(msg))
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => {
    const handler = (msg: ToastMessage) => {
      setToasts((prev) => [...prev, msg])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== msg.id))
      }, 5000)
    }
    listeners.push(handler)
    return () => { const i = listeners.indexOf(handler); if (i > -1) listeners.splice(i, 1) }
  }, [])

  const colors = {
    info:     'bg-white border-blue-300 text-blue-800',
    warning:  'bg-amber-50 border-amber-400 text-amber-900',
    critical: 'bg-red-50 border-red-400 text-red-900',
  }
  const icons = { info: '🔔', warning: '⚠️', critical: '🚨' }

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-enter flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium max-w-sm pointer-events-auto ${colors[t.type]}`}
        >
          <span>{icons[t.type]}</span>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  )
}
