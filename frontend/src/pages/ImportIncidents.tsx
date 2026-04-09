import { useState, useRef, useCallback } from 'react'

type FileType = 'csv' | 'pdf'
type Stage = 'upload' | 'previewing' | 'preview' | 'importing' | 'done'

interface PreviewRow {
  nature: string
  caseNumber: string
  dateOccurred: string
  location: string
  disposition: string
}

interface PreviewResult {
  total: number
  rows: PreviewRow[]
}

export default function ImportIncidents() {
  const [stage, setStage] = useState<Stage>('upload')
  const [fileType, setFileType] = useState<FileType | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const acceptedFile = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase()
    if (ext === 'csv')  { setFileType('csv');  return true }
    if (ext === 'pdf')  { setFileType('pdf');  return true }
    setError('Only .csv and .pdf files are supported.')
    return false
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f && acceptedFile(f)) { setFile(f); setError('') }
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f && acceptedFile(f)) { setFile(f); setError('') }
  }

  async function runPreview() {
    if (!file || !fileType) return
    setStage('previewing')
    setError('')

    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch(`/api/import/preview/${fileType}`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Preview failed')
      setPreview(data)
      setStage('preview')
    } catch (err: any) {
      setError(err.message)
      setStage('upload')
    }
  }

  async function runImport() {
    if (!file || !fileType) return
    setStage('importing')
    setError('')

    const form = new FormData()
    form.append('file', file)
    form.append('type', fileType)

    try {
      const res = await fetch('/api/import/confirm', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setResult(data)
      setStage('done')
    } catch (err: any) {
      setError(err.message)
      setStage('preview')
    }
  }

  function reset() {
    setStage('upload')
    setFile(null)
    setFileType(null)
    setPreview(null)
    setResult(null)
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-gray-900">Import Incident Log</h1>
        <p className="text-sm text-gray-400 mt-1">
          Upload a CSV or PDF incident log to bulk-import records. AI classification and geocoding run automatically in the background after import.
        </p>
      </div>

      {/* ── Upload stage ─────────────────────────────────────────────── */}
      {(stage === 'upload') && (
        <div className="space-y-5">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-green-500 bg-green-50'
                : file
                ? 'border-green-400 bg-green-50'
                : 'border-gray-300 bg-white hover:border-green-400 hover:bg-gray-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.pdf"
              className="hidden"
              onChange={handleFileInput}
            />
            <div className="text-4xl mb-3">{file ? '📄' : '⬆️'}</div>
            {file ? (
              <div>
                <p className="font-semibold text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-400 mt-1">{(file.size / 1024).toFixed(0)} KB · {fileType?.toUpperCase()}</p>
              </div>
            ) : (
              <div>
                <p className="font-semibold text-gray-700">Drop your file here or click to browse</p>
                <p className="text-sm text-gray-400 mt-1">Supports UOPD Clery log format · CSV or PDF</p>
              </div>
            )}
          </div>

          {/* Format guide */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-bold text-gray-700 mb-1">CSV Format</p>
              <p className="text-xs text-gray-500">Standard UOPD Clery log export. Columns: Nature, Case #, Date Reported, Date/Time Occurred, General Location, Disposition.</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-bold text-gray-700 mb-1">PDF Format</p>
              <p className="text-xs text-gray-500">UOPD 60-day Clery log PDF. Claude AI extracts and structures records automatically — no reformatting needed.</p>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

          <button
            onClick={runPreview}
            disabled={!file}
            className="w-full bg-green-700 text-white rounded-xl py-3 text-sm font-semibold hover:bg-green-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Preview Import
          </button>
        </div>
      )}

      {/* ── Previewing (loading) stage ────────────────────────────────── */}
      {stage === 'previewing' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center space-y-3">
          <div className="text-3xl animate-pulse">{fileType === 'pdf' ? '🤖' : '📊'}</div>
          <p className="font-semibold text-gray-800">
            {fileType === 'pdf' ? 'Claude is reading the PDF...' : 'Parsing CSV...'}
          </p>
          <p className="text-sm text-gray-400">
            {fileType === 'pdf' ? 'Extracting and structuring incident records' : 'Validating columns and records'}
          </p>
        </div>
      )}

      {/* ── Preview stage ─────────────────────────────────────────────── */}
      {stage === 'preview' && preview && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">
                  {preview.total} incident{preview.total !== 1 ? 's' : ''} found
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Showing first {preview.rows.length} rows · AI classification and geocoding will run after import
                </p>
              </div>
              <span className="text-xs bg-green-100 text-green-700 font-semibold px-2.5 py-1 rounded-full">
                {fileType?.toUpperCase()}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    {['Type', 'Location', 'Date', 'Disposition'].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900 max-w-40 truncate">{row.nature}</td>
                      <td className="px-4 py-2.5 text-gray-500 max-w-36 truncate">{row.location}</td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{row.dateOccurred?.slice(0, 10) || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-500 max-w-36 truncate">{row.disposition || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.total > preview.rows.length && (
              <p className="px-5 py-3 text-xs text-gray-400 border-t border-gray-100">
                + {preview.total - preview.rows.length} more records not shown in preview
              </p>
            )}
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex-1 border border-gray-300 text-gray-600 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={runImport}
              className="flex-1 bg-green-700 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-green-800 transition-colors"
            >
              Import {preview.total} Incidents
            </button>
          </div>
        </div>
      )}

      {/* ── Importing stage ───────────────────────────────────────────── */}
      {stage === 'importing' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center space-y-3">
          <div className="text-3xl animate-pulse">💾</div>
          <p className="font-semibold text-gray-800">Importing records...</p>
          <p className="text-sm text-gray-400">Saving to database. AI classification will continue in the background.</p>
        </div>
      )}

      {/* ── Done stage ────────────────────────────────────────────────── */}
      {stage === 'done' && result && (
        <div className="space-y-5">
          <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3">✓</div>
            <p className="text-xl font-bold text-green-800">{result.imported} incidents imported</p>
            {result.skipped > 0 && (
              <p className="text-sm text-green-600 mt-1">{result.skipped} duplicate records skipped</p>
            )}
            <p className="text-sm text-green-700 mt-3">
              AI classification and geocoding are running in the background.<br/>
              New incidents will appear in the Dashboard and Incident Log shortly.
            </p>
          </div>
          <button
            onClick={reset}
            className="w-full border border-gray-300 text-gray-600 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            Import Another File
          </button>
        </div>
      )}
    </div>
  )
}
