import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import imageSize from 'image-size';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '');
const imagesDir = resolve(root, 'images');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg']);
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

function listImageFiles(dir, base = '') {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    const full = resolve(dir, e.name);
    if (e.isDirectory()) {
      out.push(...listImageFiles(full, rel));
    } else if (e.isFile() && IMAGE_EXT.has(rel.slice(rel.lastIndexOf('.')).toLowerCase())) {
      out.push(rel);
    }
  }
  return out;
}

function getImageItem(relPath) {
  const full = resolve(imagesDir, relPath);
  let width = DEFAULT_WIDTH;
  let height = DEFAULT_HEIGHT;
  try {
    const dims = imageSize(full);
    if (dims && dims.width != null && dims.height != null) {
      width = dims.width;
      height = dims.height;
    }
  } catch (_) {
    // 读取失败时使用默认宽高
  }
  return { id: relPath, src: `/images/${relPath}`, width, height };
}

function imagesApiPlugin() {
  return {
    name: 'images-api',
    configureServer(server) {
      server.middlewares.use('/api/images', (req, res, next) => {
        if (req.method !== 'GET') return next();
        const url = req.url || '/';
        if (url === '/' || url === '') {
          const files = listImageFiles(imagesDir);
          const list = files.map((f) => getImageItem(f));
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(list));
          return;
        }
        if (url.startsWith('/random')) {
          const files = listImageFiles(imagesDir);
          const all = files.map((f) => getImageItem(f));
          const u = new URL(url, 'http://localhost');
          const count = Math.min(Math.max(1, parseInt(u.searchParams.get('count') || '1', 10)), 100);
          let exclude = u.searchParams.get('exclude');
          const excludeSet = new Set(exclude ? exclude.split(',').map((s) => s.trim()).filter(Boolean) : []);
          const pool = all.filter((item) => !excludeSet.has(item.id));
          const shuffled = pool.slice().sort(() => Math.random() - 0.5);
          const picked = shuffled.slice(0, count);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(picked));
          return;
        }
        next();
      });
      // 挂载 images 目录为静态资源，便于 /images/xxx 访问
      server.middlewares.use('/images', (req, res, next) => {
        if (req.method !== 'GET' || !req.url) return next();
        const pathname = decodeURIComponent(req.url).replace(/^\//, '').replace(/\.\./g, '');
        const file = resolve(imagesDir, pathname);
        if (!file.startsWith(imagesDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          return next();
        }
        res.setHeader('Content-Type', getMime(pathname));
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

function getMime(pathname) {
  const ext = pathname.slice(pathname.lastIndexOf('.')).toLowerCase();
  const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml' };
  return mime[ext] || 'application/octet-stream';
}

export default defineConfig({
  root,
  plugins: [vue(), imagesApiPlugin()],
  resolve: {
    alias: {
      photoswipe: resolve(root, 'src/js/photoswipe.js'),
      'photoswipe/lightbox': resolve(root, 'src/js/lightbox/lightbox.js'),
      'photoswipe/vue': resolve(root, 'src/vue/index.ts'),
    },
  },
  server: {
    host: true,
    port: 5173,
  }
});
