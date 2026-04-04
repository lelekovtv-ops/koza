import { NextResponse } from "next/server"

/**
 * GET /api/reset — returns a page that clears localStorage and redirects to /studio
 */
export async function GET() {
  const html = `<!DOCTYPE html>
<html>
<head><title>Resetting...</title></head>
<body style="background:#0B0C10;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center">
  <p style="font-size:14px;opacity:0.6">Clearing all data...</p>
  <script>
    const keys = Object.keys(localStorage).filter(k => k.startsWith('koza-') || k.startsWith('piece-'));
    keys.forEach(k => localStorage.removeItem(k));
    // Also clear IndexedDB
    if (indexedDB.databases) {
      indexedDB.databases().then(dbs => dbs.forEach(db => { if (db.name) indexedDB.deleteDatabase(db.name) }));
    }
    setTimeout(() => { window.location.href = '/studio'; }, 500);
  </script>
</div>
</body>
</html>`

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  })
}
