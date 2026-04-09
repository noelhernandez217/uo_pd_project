import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Incident, updateStatus, getNotes, addNote, deleteNote, IncidentNote } from '../api/incidents'
import SeverityBadge from './SeverityBadge'
import StatusBadge from './StatusBadge'
import MicButton from './MicButton'

interface Props {
  incident: Incident
  onClose: () => void
  onStatusChange: (updated: Incident) => void
}

function timeOpen(dateStr: string | null): string {
  if (!dateStr) return ''
  const ms = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(ms / 60000)
  const hours = Math.floor(ms / 3600000)
  const days  = Math.floor(ms / 86400000)
  if (days > 0)  return `${days}d ${hours % 24}h open`
  if (hours > 0) return `${hours}h ${mins % 60}m open`
  return `${mins}m open`
}

function timeOpenColor(dateStr: string | null): string {
  if (!dateStr) return 'text-gray-400'
  const hours = (Date.now() - new Date(dateStr).getTime()) / 3600000
  if (hours > 24) return 'text-red-500 font-semibold'
  if (hours > 4)  return 'text-orange-500 font-semibold'
  if (hours > 1)  return 'text-yellow-600'
  return 'text-gray-400'
}

export default function IncidentDetail({ incident, onClose, onStatusChange }: Props) {
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState<IncidentNote[]>([])
  const [noteText, setNoteText] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const noteInputRef = useRef<HTMLTextAreaElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    getNotes(incident.id).then(setNotes).catch(() => {})
  }, [incident.id])

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSaving(true)
    try {
      const updated = await updateStatus(incident.id, e.target.value)
      onStatusChange(updated)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddNote() {
    if (!noteText.trim()) return
    setAddingNote(true)
    try {
      const note = await addNote(incident.id, noteText)
      setNotes((prev) => [...prev, note])
      setNoteText('')
    } finally {
      setAddingNote(false)
    }
  }

  async function handleDeleteNote(noteId: number) {
    await deleteNote(incident.id, noteId)
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
  }

  function handleShowOnMap() {
    onClose()
    if ((incident as any).lat && (incident as any).lng) {
      navigate(`/map?lat=${(incident as any).lat}&lng=${(incident as any).lng}&id=${incident.id}`)
    } else {
      navigate('/map')
    }
  }

  const isOpen = incident.status === 'open' || incident.status === 'in-progress'

  return (
    <div className="modal-backdrop fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="modal-panel bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{incident.nature}</h2>
            <p className="text-sm text-gray-500 mt-0.5">Case #{incident.caseNumber || 'N/A'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Badges + time open */}
          <div className="flex items-center gap-2 flex-wrap">
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
            {isOpen && incident.dateOccurred && (
              <span className={`text-xs ${timeOpenColor(incident.dateOccurred)}`}>
                · {timeOpen(incident.dateOccurred)}
              </span>
            )}
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 font-medium">Location</p>
              <p className="text-gray-900">{incident.location || '—'}</p>
            </div>
            <div>
              <p className="text-gray-500 font-medium">Campus</p>
              <p className="text-gray-900">{incident.campus}</p>
            </div>
            <div>
              <p className="text-gray-500 font-medium">Date Occurred</p>
              <p className="text-gray-900">{incident.dateOccurred || '—'}</p>
            </div>
            <div>
              <p className="text-gray-500 font-medium">Date Reported</p>
              <p className="text-gray-900">{incident.dateReported || '—'}</p>
            </div>
            <div className="col-span-2">
              <p className="text-gray-500 font-medium">Disposition</p>
              <p className="text-gray-900">{incident.disposition || '—'}</p>
            </div>
          </div>

          {/* AI section */}
          {(incident.aiSummary || incident.aiRecommendation) && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">AI Analysis</p>
              {incident.aiSummary && (
                <div>
                  <p className="text-xs text-blue-500 font-medium">Summary</p>
                  <p className="text-sm text-gray-800">{incident.aiSummary}</p>
                </div>
              )}
              {incident.aiRecommendation && (
                <div>
                  <p className="text-xs text-blue-500 font-medium">Recommended Action</p>
                  <p className="text-sm text-gray-800">{incident.aiRecommendation}</p>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Dispatcher Notes</p>
            {notes.length === 0 && (
              <p className="text-xs text-gray-400 mb-2">No notes yet.</p>
            )}
            {notes.length > 0 && (
              <div className="space-y-2 mb-3">
                {notes.map((note) => (
                  <div key={note.id} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm text-gray-800">{note.text}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(note.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="text-gray-300 hover:text-red-400 text-xs shrink-0 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <textarea
                ref={noteInputRef}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddNote() } }}
                placeholder="Add a note... (Enter to save, or use mic to dictate)"
                rows={2}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
              <div className="flex flex-col gap-1.5 self-end">
                <MicButton
                  size="md"
                  onTranscript={(t) => setNoteText((prev) => prev ? `${prev} ${t}` : t)}
                />
                <button
                  onClick={handleAddNote}
                  disabled={addingNote || !noteText.trim()}
                  className="bg-green-700 text-white rounded-lg px-3 py-2 text-xs font-semibold hover:bg-green-800 disabled:opacity-40 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>

          {/* Actions row */}
          <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Update Status</label>
              <select
                defaultValue={incident.status}
                onChange={handleStatusChange}
                disabled={saving}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
              >
                <option value="open">Open</option>
                <option value="in-progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
            <button
              onClick={handleShowOnMap}
              className="shrink-0 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2 text-sm font-semibold hover:bg-green-100 transition-colors mt-4"
            >
              📍 Show on Map
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
