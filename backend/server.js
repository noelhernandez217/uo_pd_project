const { app, init } = require('./app');

const PORT = process.env.PORT || 3001;

init();

app.listen(PORT, () => {
  console.log(`CampusSafe API running on http://localhost:${PORT}`);
  console.log(`Anthropic API key: ${process.env.ANTHROPIC_API_KEY ? 'configured' : 'NOT SET — using heuristic fallback'}`);
});
