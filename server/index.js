// Run locally: npm start  (reads settings from .env if present)
const app = require('./app');
const { init } = require('./db');
const PORT = Number(process.env.PORT) || 3000;

init()
  .then(() => app.listen(PORT, () => console.log(`Maitri Cafe v${app.APP_VERSION} running on http://localhost:${PORT}`)))
  .catch(e => { console.error('Could not connect to the database:', e.message); process.exit(1); });
