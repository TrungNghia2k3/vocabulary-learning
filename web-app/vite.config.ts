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

  return {
    name: 'vite-plugin-vocab-sheets',
    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },
    load(id) {
      if (id === resolvedId) {
        const data = loadAllCsvs();
        return `export const rawSheets = ${JSON.stringify(data)};\nexport const loadedAt = ${JSON.stringify(new Date().toISOString())};\n`;
      }
    },
    configureServer(server) {
      if (fs.existsSync(SHEETS_DIR)) {
        server.watcher.add(SHEETS_DIR);
        const reloadSheets = (filePath: string) => {
          if (filePath.toLowerCase().endsWith('.csv')) {
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
