const OpenAI = require('openai');

function severityFromHeuristic(nature) {
  const n = (nature || '').toLowerCase();
  if (n.includes('assault') || n.includes('robbery') || n.includes('weapon') || n.includes('sex') || n.includes('kidnap') || n.includes('homicide')) {
    return 'critical';
  }
  if (n.includes('burglary') || n.includes('theft 1') || n.includes('dui') || n.includes('menacing') || n.includes('strangulation')) {
    return 'high';
  }
  if (n.includes('theft 2') || n.includes('theft 3') || n.includes('criminal mischief') || n.includes('trespass') || n.includes('suspicious') || n.includes('harassment')) {
    return 'medium';
  }
  return 'low';
}

function recommendationFromSeverity(severity) {
  switch (severity) {
    case 'critical': return 'Dispatch officers immediately and notify supervisor on duty.';
    case 'high': return 'Assign officer to investigate promptly. Follow up within 1 hour.';
    case 'medium': return 'Log and schedule follow-up investigation within 24 hours.';
    default: return 'Document and monitor. No immediate action required.';
  }
}

function classifyHeuristic(nature, disposition) {
  const severity = severityFromHeuristic(nature);
  return {
    severity,
    aiSummary: `${nature} incident reported. ${disposition ? 'Disposition: ' + disposition + '.' : ''}`.trim(),
    aiRecommendation: recommendationFromSeverity(severity),
  };
}

async function classifyWithClaude(nature, description, location) {
  if (!process.env.OPENAI_API_KEY) {
    return classifyHeuristic(nature, description);
  }

  try {
    const client = new OpenAI();
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `You are a campus safety incident classifier. Given an incident report, respond with JSON only — no markdown, no explanation.

Incident type: ${nature}
Location: ${location || 'Unknown'}
Description: ${description || 'No additional description provided'}

Respond with exactly this JSON:
{
  "severity": "low|medium|high|critical",
  "aiSummary": "one sentence summary of the incident",
  "aiRecommendation": "one sentence recommended action for campus safety staff"
}

Severity guide:
- critical: violent crime, weapons, assault, active medical emergency, sexual assault
- high: burglary, DUI, significant theft, threats, harassment
- medium: minor theft, trespassing, suspicious activity, vandalism, noise disturbance
- low: lost property, information-only report, non-criminal matter`,
        },
      ],
    });

    const text = response.choices[0].message.content.trim();
    return JSON.parse(text);
  } catch (err) {
    console.error('OpenAI classification failed, using heuristic fallback:', err.message);
    return classifyHeuristic(nature, description);
  }
}

module.exports = { classifyHeuristic, classifyWithClaude };
