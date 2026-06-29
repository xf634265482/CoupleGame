import { createRequire } from 'node:module';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);
const { syncBalanceDocs } = require('../scripts/sync-gm-balance-docs.js');

function gmDocSyncPlugin() {
  return {
    name: 'gm-doc-sync-plugin',
    configureServer(server) {
      server.middlewares.use('/__gm/sync-balance-docs', async (req, res, next) => {
        if (req.method !== 'POST') {
          return next();
        }

        try {
          let body = '';
          for await (const chunk of req) {
            body += chunk;
          }
          const payload = body ? JSON.parse(body) : {};
          const result = syncBalanceDocs(payload);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(result));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({
            ok: false,
            message,
          }));
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [gmDocSyncPlugin()],
  build: {
    outDir: 'dist',
  },
});
