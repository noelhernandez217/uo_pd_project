import { useState } from 'react'
import { createIncident, Incident } from '../api/incidents'
import SeverityBadge from '../components/SeverityBadge'

const COMMON_TYPES = [
  'Theft',
  'Theft 2',
  'Theft 3',
  'Criminal Trespass',
  'Criminal Mischief',
  'Suspicious Activity',
  'Noise Complaint',
  'Medical Emergency',
  'Assault',
  'Burglary',
  'DUI',
  'Harassment',
  'Lost/Found Property',
  'Information - Non Crime',
  'Other',
]

export default function SubmitIncident() {
  function localDateTimeString() {
    const d = new Date()
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  }

  const [form, setForm] = useState({
    nature: '',
    location: '',
    dateOccurred: localDateTimeString(),
    description: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<Incident | null>(null)
  const [error, setError] = useState('')

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nature || !form.location) {
      setError('Incident type and location are required.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const incident = await createIncident(form)
      setResult(incident)
      setForm({ nature: '', location: '', dateOccurred: localDateTimeString(), description: '' })
    } catch {
      setError('Failed to submit incident. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Report an Incident</h1>
      <p className="text-sm text-gray-500 mb-6">Submit a new incident report. AI will automatically classify and prioritize it.</p>

      {result && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-green-700 font-semibold">Incident Submitted</span>
            <SeverityBadge severity={result.severity} />
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">AI Classification</p>
            <p className="text-sm text-gray-800"><span className="font-medium">Summary:</span> {result.aiSummary}</p>
            <p className="text-sm text-gray-800"><span className="font-medium">Recommended Action:</span> {result.aiRecommendation}</p>
          </div>
          <button
            onClick={() => setResult(null)}
            className="text-sm text-green-700 underline"
          >
            Submit another incident
          </button>
        </div>
      )}

      {!result && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Incident Type <span className="text-red-500">*</span></label>
            <select
              name="nature"
              value={form.nature}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">Select a type...</option>
              {COMMON_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location <span className="text-red-500">*</span></label>
            <input
              type="text"
              name="location"
              value={form.location}
              onChange={handleChange}
              placeholder="e.g. 1501 Kincaid St"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time Occurred</label>
            <input
              type="datetime-local"
              name="dateOccurred"
              value={form.dateOccurred}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={4}
              placeholder="Describe what happened..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-green-700 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-green-800 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Submitting & Classifying...' : 'Submit Incident'}
          </button>
        </form>
      )}
    </div>
  )
}
