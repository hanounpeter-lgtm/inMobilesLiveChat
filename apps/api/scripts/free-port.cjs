/* Kill whatever is listening on the given port (Windows-safe). Prevents the
 * nest --watch zombie-child EADDRINUSE crash on restart. */
const { execSync } = require('child_process');

const port = process.argv[2] ?? '3001';
try {
  const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, {
    encoding: 'utf8',
  });
  const pids = new Set(
    out
      .trim()
      .split('\n')
      .map((line) => line.trim().split(/\s+/).pop())
      .filter((pid) => pid && pid !== '0'),
  );
  for (const pid of pids) {
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      console.log(`freed port ${port} (killed PID ${pid})`);
    } catch {
      /* already gone */
    }
  }
} catch {
  /* nothing listening — fine */
}
