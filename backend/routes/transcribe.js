const express = require('express')
const router = express.Router()
const multer = require('multer')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB — Whisper's max
})

// POST /api/transcribe
router.post('/', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file received' })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' })
  }

  try {
    // Determine file extension from MIME type so Whisper can identify the format
    const mime = req.file.mimetype || 'audio/webm'
    const ext = mime.includes('mp4') || mime.includes('m4a') ? 'm4a'
              : mime.includes('ogg')  ? 'ogg'
              : mime.includes('wav')  ? 'wav'
              : 'webm'

    const formData = new FormData()
    formData.append(
      'file',
      new Blob([req.file.buffer], { type: mime }),
      `recording.${ext}`
    )
    formData.append('model', 'whisper-1')
    formData.append('language', 'en')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('[Transcribe] OpenAI error:', err)
      return res.status(502).json({ error: 'Transcription failed' })
    }

    const { text } = await response.json()
    res.json({ text: text?.trim() ?? '' })
  } catch (err) {
    console.error('[Transcribe] Error:', err.message)
    res.status(500).json({ error: 'Transcription failed' })
  }
})

module.exports = router
