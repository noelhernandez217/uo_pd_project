import { useState, useRef } from 'react'

interface Props {
  onTranscript: (text: string) => void
  disabled?: boolean
  size?: 'sm' | 'md'
}

// Web Speech API — available in Chrome & Edge, not Safari or Firefox
const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null

export default function MicButton({ onTranscript, disabled, size = 'sm' }: Props) {
  const [listening, setListening]       = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [error, setError]               = useState<string | null>(null)

  const recRef          = useRef<any>(null)         // SpeechRecognition instance
  const mediaRecRef     = useRef<MediaRecorder | null>(null)
  const chunksRef       = useRef<Blob[]>([])

  const iconSize = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5'
  const btnSize  = size === 'md' ? 'p-2'     : 'p-1.5'

  // ── Web Speech API path (Chrome / Edge) ──────────────────────────────
  function startSpeechAPI() {
    setError(null)
    const rec = new SpeechRecognitionAPI()
    rec.continuous      = true
    rec.interimResults  = false
    rec.lang            = 'en-US'

    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const t = e.results[i][0].transcript.trim()
          if (t) onTranscript(t)
        }
      }
    }

    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed') setError('Microphone permission denied')
      setListening(false)
    }

    rec.onend = () => setListening(false)

    recRef.current = rec
    rec.start()
    setListening(true)
  }

  function stopSpeechAPI() {
    recRef.current?.stop()
    setListening(false)
  }

  // ── MediaRecorder + Whisper path (Safari / Firefox) ──────────────────
  async function startMediaRecorder() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
      const recorder = new MediaRecorder(stream)

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setListening(false)
        setTranscribing(true)

        const mime = recorder.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: mime })
        const form = new FormData()
        const ext  = mime.includes('mp4') || mime.includes('m4a') ? 'm4a'
                   : mime.includes('ogg') ? 'ogg'
                   : mime.includes('wav') ? 'wav'
                   : 'webm'
        form.append('audio', blob, `recording.${ext}`)

        try {
          const res  = await fetch('/api/transcribe', { method: 'POST', body: form })
          const data = await res.json()
          if (data.text) onTranscript(data.text)
          else if (data.error) setError('Transcription failed')
        } catch {
          setError('Transcription failed')
        } finally {
          setTranscribing(false)
        }
      }

      recorder.start()
      mediaRecRef.current = recorder
      setListening(true)
    } catch {
      setError('Microphone permission denied')
    }
  }

  function stopMediaRecorder() {
    mediaRecRef.current?.stop()
    // onstop handler takes over from here
  }

  // ── Unified handlers ─────────────────────────────────────────────────
  function handleClick() {
    if (transcribing) return
    if (listening) {
      SpeechRecognitionAPI ? stopSpeechAPI() : stopMediaRecorder()
    } else {
      SpeechRecognitionAPI ? startSpeechAPI() : startMediaRecorder()
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  const title = error       ? error
              : transcribing ? 'Transcribing…'
              : listening    ? 'Stop dictation'
              : 'Dictate note (voice input)'

  const buttonClass = `shrink-0 ${btnSize} rounded-lg border transition-colors ${
    transcribing
      ? 'bg-blue-50 border-blue-300 text-blue-400 cursor-wait'
      : listening
        ? 'bg-red-50 border-red-300 text-red-500 animate-pulse'
        : error
          ? 'bg-gray-50 border-gray-200 text-gray-300'
          : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-green-700 hover:bg-green-50 hover:border-green-300'
  } disabled:opacity-40`

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || !!error || transcribing}
        title={title}
        className={buttonClass}
      >
        {transcribing ? (
          /* Spinner */
          <svg className={`${iconSize} animate-spin`} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : listening ? (
          /* Stop square */
          <svg className={iconSize} fill="currentColor" viewBox="0 0 16 16">
            <rect x="3" y="3" width="10" height="10" rx="1.5" />
          </svg>
        ) : (
          /* Microphone */
          <svg className={iconSize} fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z" />
            <path d="M5.25 11a.75.75 0 0 1 .75.75v.5a6 6 0 0 0 12 0v-.5a.75.75 0 0 1 1.5 0v.5a7.5 7.5 0 0 1-6.75 7.464V22.5h2.25a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1 0-1.5h2.25v-2.786A7.5 7.5 0 0 1 4.5 12.25v-.5a.75.75 0 0 1 .75-.75Z" />
          </svg>
        )}
      </button>
      {transcribing && (
        <span className="text-[9px] text-blue-400 whitespace-nowrap">transcribing</span>
      )}
    </div>
  )
}
