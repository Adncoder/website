// Math practice: a static page like Spanish practice (client/kshsaa-math/),
// open to everyone, with nothing stored on the server.

import { Router, static as serveStatic } from 'express';
import { fileURLToPath } from 'url';

const router = Router();
const directory = fileURLToPath(new URL('../client/kshsaa-math/', import.meta.url));

// Canonical trailing slash keeps the page's relative module URLs in this section.
router.get('/', (req, res, next) => {
  if (!req.originalUrl.split('?')[0].endsWith('/')) {
    return res.redirect(302, '/kshsaa-math/');
  }
  next();
});

router.use(serveStatic(directory));

export default router;
