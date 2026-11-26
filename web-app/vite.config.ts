import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

const SHEETS_DIR = path.resolve(__dirname, '../sheets');

/**
 * Virtual module plugin that reads all CSV files directly from ../sheets/*.csv.
 * - In dev mode: watches ../sheets/ and triggers instant HMR reload whenever any CSV is edited or synced!
 * - In build mode: bundles the latest CSVs cleanly into the production build.
 */
function vocabSheetsPlugin(): Plugin {
  const virtualId = 'virtual:vocab-sheets';
  const resolvedId = '\0' + virtualId;

  function loadAllCsvs(): Record<string, string> {
    const out: Record<string, string> = {};
    if (!fs.existsSync(SHEETS_DIR)) return out;
    const files = fs
      .readdirSync(SHEETS_DIR)
      .filter((f) => f.toLowerCase().endsWith('.csv'))
      .sort((a, b) => a.localeCompare(b));
    for (const file of files) {
      const full = path.join(SHEETS_DIR, file);
      const raw = fs.readFileSync(full, 'utf-8').replace(/^\uFEFF/, '');
      out[file] = raw;
    }
    return out;
  }

  function loadTask1Images(): Record<string, Record<string, string>> {
    const manifestPath = path.join(SHEETS_DIR, '_task1_images.json');
    if (!fs.existsSync(manifestPath)) return {};
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch {
      return {};
    }
  }

  return {
    name: 'vite-plugin-vocab-sheets',
    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },
    load(id) {
      if (id === resolvedId) {
        const data = loadAllCsvs();
        const task1Images = loadTask1Images();
        return `export const rawSheets = ${JSON.stringify(data)};\nexport const task1Images = ${JSON.stringify(task1Images)};\nexport const loadedAt = ${JSON.stringify(new Date().toISOString())};\n`;
      }
    },
    configureServer(server) {
      if (fs.existsSync(SHEETS_DIR)) {
        server.watcher.add(SHEETS_DIR);
        const reloadSheets = (filePath: string) => {
          const lower = filePath.toLowerCase();
          if (lower.endsWith('.csv') || lower.endsWith('_task1_images.json')) {
            const mod = server.moduleGraph.getModuleById(resolvedId);
            if (mod) {
              server.moduleGraph.invalidateModule(mod);
            }
            server.ws.send({ type: 'full-reload' });
          }
        };
        server.watcher.on('change', reloadSheets);
        server.watcher.on('add', reloadSheets);
        server.watcher.on('unlink', reloadSheets);
      }

      // Dev middleware for /api/news so Live News Reader works identically on localhost:5173
      server.middlewares.use('/api/news', async (req, res) => {
        try {
          // @ts-expect-error runtime ESM import from repo root api helper
          const core = await import('../api/_newsCore.mjs');
          const urlObj = new URL(req.url || '/', 'http://localhost');
          const articleUrl = urlObj.searchParams.get('articleUrl');
          const category = urlObj.searchParams.get('category') || 'all';
          const payload = articleUrl
            ? await core.fetchFullArticle(articleUrl)
            : await core.fetchLiveNewsFeed(category);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(payload));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : 'News API error',
            })
          );
        }
      });

      // Dev middleware for /api/save-vocab (1-click Google Sheets Apps Script webhook proxy)
      server.middlewares.use('/api/save-vocab', async (req, res) => {
        try {
          // @ts-expect-error runtime ESM import from repo root api helper
          const core = await import('../api/_saveVocabCore.mjs');
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          if (req.method === 'GET') {
            res.statusCode = 200;
            res.end(JSON.stringify(core.getServerWebhookInfo()));
            return;
          }
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
            return;
          }
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          const result = await core.forwardToGoogleSheet(body);
          res.statusCode = 200;
          res.end(JSON.stringify(result));
        } catch (err) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(
            JSON.stringify({
              ok: false,
              error: err instanceof Error ? err.message : 'Save Vocab API error',
            })
          );
        }
      });

      // Dev middleware for /api/youtube (curated channels + timed English transcript)
      server.middlewares.use('/api/youtube', async (req, res) => {
        try {
          // @ts-expect-error runtime ESM import from repo root api helper
          const core = await import('../api/_youtubeCore.mjs');
          const urlObj = new URL(req.url || '/', 'http://localhost');
          const video = urlObj.searchParams.get('video');
          const channel = urlObj.searchParams.get('channel') || 'all';
          const payload = video
            ? await core.fetchYoutubeTranscript(video)
            : await core.fetchYoutubeFeed(channel);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(payload));
        } catch (err) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : 'YouTube API error',
            })
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), vocabSheetsPlugin()],
  server: {
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
});
