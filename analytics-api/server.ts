import express, { Request, Response } from 'express';
import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const dbPath = path.resolve(__dirname, '..', 'database.sqlite');
const STATS_PASSWORD = process.env.STATS_PASSWORD;

if (!STATS_PASSWORD) {
  console.warn(
    'WARNING: STATS_PASSWORD is not set in environment variables. Access to /master will be restricted.',
  );
}

app.use(cors());
app.use(express.json());
app.set('trust proxy', true);

let db: Database<sqlite3.Database, sqlite3.Statement>;

(async () => {
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  await db.exec(`
        CREATE TABLE IF NOT EXISTS visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            utm_source TEXT,
            utm_medium TEXT,
            utm_content TEXT,
            ip TEXT,
            user_agent TEXT,
            path TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
})();

app.post('/track', async (req: Request, res: Response) => {
  const { utm_source, utm_medium, utm_content, path: pagePath } = req.body;
  const ip = (req.headers['x-forwarded-for'] as string) || req.ip || req.socket.remoteAddress;
  const ua = req.headers['user-agent'];

  try {
    await db.run(
      'INSERT INTO visits (utm_source, utm_medium, utm_content, ip, user_agent, path) VALUES (?, ?, ?, ?, ?, ?)',
      [utm_source || null, utm_medium || null, utm_content || null, ip, ua, pagePath || '/'],
    );
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('Tracking error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/master', async (req: Request, res: Response) => {
  const providedPassword = req.query.password || req.headers['x-stats-password'];

  if (STATS_PASSWORD && providedPassword === STATS_PASSWORD) {
    try {
      const totalVisits = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM visits');
      const instagramReferrals = await db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM visits WHERE utm_source = "ig" OR utm_source = "instagram"',
      );
      const referralsBySource = await db.all<{ utm_source: string; count: number }[]>(
        'SELECT utm_source, COUNT(*) as count FROM visits WHERE utm_source IS NOT NULL GROUP BY utm_source',
      );
      const recentVisits = await db.all('SELECT * FROM visits ORDER BY timestamp DESC LIMIT 100');

      res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>uwayss.com | Analytics Dashboard</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #fafafa; color: #333; line-height: 1.6; padding: 20px; }
                        .container { max-width: 1000px; margin: 0 auto; }
                        h1 { font-weight: 300; border-bottom: 1px solid #eee; padding-bottom: 20px; }
                        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 40px; }
                        .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); text-align: center; border: 1px solid #eee; }
                        .card .label { color: #888; font-size: 0.9em; text-transform: uppercase; letter-spacing: 0.5px; }
                        .card .value { font-size: 2.5em; font-weight: 700; margin: 10px 0; color: #000; }
                        table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05); border: 1px solid #eee; }
                        th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #eee; font-size: 0.9em; }
                        th { background: #f8f8f8; font-weight: 600; text-transform: uppercase; font-size: 0.8em; color: #666; }
                        tr:last-child td { border-bottom: none; }
                        tr.clickable { cursor: pointer; transition: background 0.2s; }
                        tr.clickable:hover { background: #f0f0f0; }
                        .utm-tag { background: #e3f2fd; color: #1976d2; padding: 2px 8px; border-radius: 4px; font-size: 0.85em; font-family: monospace; }
                        .ip-tag { color: #666; font-family: monospace; }
                        time { color: #999; }
                        
                        /* Modal Styles */
                        #modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; justify-content: center; align-items: center; }
                        #modal { background: white; padding: 30px; border-radius: 8px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; position: relative; }
                        #modal h2 { margin-top: 0; font-weight: 300; border-bottom: 1px solid #eee; padding-bottom: 15px; }
                        .detail-row { margin-bottom: 15px; }
                        .detail-label { font-weight: 600; font-size: 0.8em; color: #888; text-transform: uppercase; margin-bottom: 5px; }
                        .detail-value { font-family: monospace; background: #f5f5f5; padding: 10px; border-radius: 4px; word-break: break-all; }
                        #close-modal { position: absolute; top: 15px; right: 15px; border: none; background: none; font-size: 24px; cursor: pointer; color: #ccc; }
                        #close-modal:hover { color: #333; }
                    </style>
                </head>
                <body>
                    <div id="modal-overlay" onclick="closeModal()">
                        <div id="modal" onclick="event.stopPropagation()">
                            <button id="close-modal" onclick="closeModal()">&times;</button>
                            <h2>Visit Details</h2>
                            <div id="modal-content"></div>
                        </div>
                    </div>

                    <div class="container">
                        <h1>Analytics Overview</h1>
                        
                        <div class="stats-grid">
                            <div class="card">
                                <div class="label">Total Visits</div>
                                <div class="value">${totalVisits?.count || 0}</div>
                            </div>
                            <div class="card">
                                <div class="label">Instagram Hits</div>
                                <div class="value">${instagramReferrals?.count || 0}</div>
                            </div>
                            ${referralsBySource
                              .filter((r) => r.utm_source !== 'ig' && r.utm_source !== 'instagram')
                              .map(
                                (r) => `
                                <div class="card">
                                    <div class="label">${r.utm_source} Hits</div>
                                    <div class="value">${r.count}</div>
                                </div>
                            `,
                              )
                              .join('')}
                        </div>

                        <h2>Recent Activity</h2>
                        <div style="overflow-x: auto;">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Timestamp</th>
                                        <th>Source</th>
                                        <th>Page</th>
                                        <th>IP Address</th>
                                        <th>User Agent</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${recentVisits
                                      .map(
                                        (v) => `
                                        <tr class="clickable" onclick='showDetails(${JSON.stringify(v).replace(/'/g, '&#39;')})'>
                                            <td><time>${new Date(v.timestamp).toLocaleString()}</time></td>
                                            <td>${v.utm_source ? `<span class="utm-tag">${v.utm_source}</span>` : '<span style="color:#ccc">—</span>'}</td>
                                            <td><code>${v.path}</code></td>
                                            <td><span class="ip-tag">${v.ip}</span></td>
                                            <td title="${v.user_agent}">${v.user_agent ? v.user_agent.substring(0, 30) : ''}...</td>
                                        </tr>
                                    `,
                                      )
                                      .join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <script>
                        function showDetails(visit) {
                            const content = document.getElementById('modal-content');
                            content.innerHTML = \`
                                <div class="detail-row">
                                    <div class="detail-label">Timestamp</div>
                                    <div class="detail-value">\${new Date(visit.timestamp).toLocaleString()}</div>
                                </div>
                                <div class="detail-row">
                                    <div class="detail-label">UTM Source</div>
                                    <div class="detail-value">\${visit.utm_source || 'None'}</div>
                                </div>
                                <div class="detail-row">
                                    <div class="detail-label">UTM Medium</div>
                                    <div class="detail-value">\${visit.utm_medium || 'None'}</div>
                                </div>
                                <div class="detail-row">
                                    <div class="detail-label">UTM Content</div>
                                    <div class="detail-value">\${visit.utm_content || 'None'}</div>
                                </div>
                                <div class="detail-row">
                                    <div class="detail-label">Page Path</div>
                                    <div class="detail-value">\${visit.path}</div>
                                </div>
                                <div class="detail-row">
                                    <div class="detail-label">IP Address</div>
                                    <div class="detail-value">\${visit.ip}</div>
                                </div>
                                <div class="detail-row">
                                    <div class="detail-label">User Agent</div>
                                    <div class="detail-value">\${visit.user_agent}</div>
                                </div>
                            \`;
                            document.getElementById('modal-overlay').style.display = 'flex';
                        }

                        function closeModal() {
                            document.getElementById('modal-overlay').style.display = 'none';
                        }
                    </script>
                </body>
                </html>
            `);
    } catch (err) {
      console.error('Stats error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.status(401).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #fafafa; }
                    form { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 1px solid #eee; }
                    input { padding: 10px; border: 1px solid #ddd; border-radius: 4px; width: 250px; display: block; margin-bottom: 20px; font-size: 16px; }
                    button { background: #000; color: #fff; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 16px; width: 100%; }
                </style>
            </head>
            <body>
                <form method="get">
                    <h1 style="font-size: 20px; margin-top: 0;">Analytics Login</h1>
                    <input type="password" name="password" placeholder="Password" autofocus>
                    <button type="submit">View Stats</button>
                </form>
            </body>
            </html>
        `);
  }
});

app.listen(port, () => {
  console.log(`Analytics API running at http://localhost:${port}`);
});
