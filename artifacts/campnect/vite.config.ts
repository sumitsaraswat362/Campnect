import path from 'path';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const rawPort = process.env.PORT ?? '22821';
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

const basePath = process.env.BASE_PATH ?? '/';
// Android is the release-version source of truth. Bake the same name into
// browser builds rather than maintaining a separate Settings/About constant.
const androidBuild = readFileSync(path.resolve(import.meta.dirname, '../../android/app/build.gradle'), 'utf8');
const appVersion = androidBuild.match(/^\s*versionName\s+"([^"]+)"/m)?.[1];
if (!appVersion) throw new Error('Android versionName is missing from android/app/build.gradle');
const demoEnabled = (process.env.VITE_DEMO_MODE ?? loadEnv(process.env.NODE_ENV === 'production' ? 'production' : 'development', import.meta.dirname, 'VITE_').VITE_DEMO_MODE) === 'true';
const apiProxy = {
  '/api': {
    target: 'http://localhost:8080',
    changeOrigin: true,
  },
  '/uploads': {
    target: 'http://localhost:8080',
    changeOrigin: true,
  },
  '/socket.io': {
    target: 'http://localhost:8080',
    changeOrigin: true,
    ws: true,
  },
};

export default defineConfig({
  base: basePath,
  // GIPHY requires search and trending calls to originate in the client. This
  // is intentionally a restricted public application key, never a chat value.
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    'import.meta.env.VITE_GIPHY_API_KEY': JSON.stringify(process.env.GIPHY_API_KEY || ''),
  },
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: path.resolve(import.meta.dirname, 'index.html'),
      },
    },
    sourcemap: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: false,
    },
    // Forward API, uploads, and Socket.IO traffic to the API Server in local
    // development. The standalone preview server needs the identical routes.
    proxy: demoEnabled ? undefined : apiProxy,
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: demoEnabled ? undefined : apiProxy,
  },
});
