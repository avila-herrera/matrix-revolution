/**
 * =====================================================
 *  Ávila Herrera · Servidor local
 *  Ejecutar: node server.js
 *  Acceder:  http://localhost:3000
 * =====================================================
 */

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const PORT    = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

/* Detectar automáticamente el HTML más reciente */
function getLatestHTML() {
  const files = fs.readdirSync(__dirname)
    .filter(f => /^\d+_avila-herrera-admin\.html$/.test(f))
    .map(f => ({ name: f, version: parseInt(f) }))
    .sort((a, b) => b.version - a.version);
  if (!files.length) throw new Error('No se encontró ningún archivo HTML del sistema');
  return path.join(__dirname, files[0].name);
}

/* ── Helpers de base de datos ── */
function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { desarrolladores: [], desarrollos: [], unidades: [] }; }
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c.toString());
    req.on('end',  () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('JSON inválido')); } });
    req.on('error', reject);
  });
}

/* ── Respuestas ── */
function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
  });
  res.end(JSON.stringify(data));
}
function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

/* ── CRUD genérico ── */
function makeCRUD(col) {
  return {
    list:   db => db[col] || [],
    create: (db, body) => {
      const arr = db[col] || [];
      const id  = arr.length ? Math.max(...arr.map(x => x.id)) + 1 : 1;
      const rec = { id, ...body };
      arr.push(rec); db[col] = arr; return rec;
    },
    update: (db, id, body) => {
      const arr = db[col] || [];
      const idx = arr.findIndex(x => x.id === id);
      if (idx === -1) return null;
      arr[idx] = { ...arr[idx], ...body, id };
      db[col] = arr; return arr[idx];
    },
    remove: (db, id) => {
      const arr = db[col] || [];
      const idx = arr.findIndex(x => x.id === id);
      if (idx === -1) return false;
      arr.splice(idx, 1); db[col] = arr; return true;
    },
  };
}

const CRUD = {
  desarrolladores:    makeCRUD('desarrolladores'),
  desarrollos:        makeCRUD('desarrollos'),
  unidades:           makeCRUD('unidades'),
  personal:           makeCRUD('personal'),
  categoriasPersonal: makeCRUD('categoriasPersonal'),
  departamentos:      makeCRUD('departamentos'),
};

/* ── Guardias relacionales ── */
function tieneDesarrollos(db, desarrolladorId) {
  return (db.desarrollos || []).some(d => d.desarrolladorId === desarrolladorId);
}
function tieneUnidades(db, desarrolloId) {
  return (db.unidades || []).some(u => u.desarrolloId === desarrolloId);
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/* ══════════════════════════════════════════════════
   SERVIDOR
   ══════════════════════════════════════════════════ */
const server = http.createServer(async (req, res) => {
  const url    = req.url.split('?')[0];
  const method = req.method.toUpperCase();

  /* CORS preflight */
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(); return;
  }

  /* ── HTML principal ── */
  if (url === '/' || url === '/index.html') {
    try { serveFile(res, getLatestHTML(), 'text/html; charset=utf-8'); }
    catch (e) { res.writeHead(500); res.end(e.message); }
    return;
  }

  /* ── Imágenes de desarrollos ── */
  if (url.startsWith('/02%20IMAGENES') || url.startsWith('/02 IMAGENES')) {
    const decoded = decodeURIComponent(url.slice(1));
    const ext  = path.extname(decoded).toLowerCase();
    const mime = {'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png',
                  '.webp':'image/webp','.gif':'image/gif'}[ext] || 'application/octet-stream';
    serveFile(res, path.join(__dirname, decoded), mime); return;
  }

  /* ── Imágenes de unidades ── */
  if (url.startsWith('/03%20IMAGENES') || url.startsWith('/03 IMAGENES')) {
    const decoded = decodeURIComponent(url.slice(1));
    const ext  = path.extname(decoded).toLowerCase();
    const mime = {'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png',
                  '.webp':'image/webp','.gif':'image/gif'}[ext] || 'application/octet-stream';
    serveFile(res, path.join(__dirname, decoded), mime); return;
  }


  /* ── Logo ── */
  if (url.startsWith('/01%20IMAGENES') || url.startsWith('/01 IMAGENES')) {
    const decoded = decodeURIComponent(url.slice(1));
    const ext  = path.extname(decoded).toLowerCase();
    const mime = {'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png',
                  '.svg':'image/svg+xml','.webp':'image/webp'}[ext] || 'application/octet-stream';
    serveFile(res, path.join(__dirname, decoded), mime); return;
  }

  /* ── POST /api/login ── */
  if (url === '/api/login' && method === 'POST') {
    try {
      const body = await parseBody(req);
      const { usuario, password } = body;
      if (!usuario || !password) { json(res, 400, { error: 'Usuario y contraseña requeridos' }); return; }
      const db = readDB();
      const personal = db.personal || [];
      const user = personal.find(p =>
        p.usuario === usuario &&
        p.accesoSistema === true &&
        p.estatus === 'Activo'
      );
      if (!user || user.password !== hashPassword(password)) {
        json(res, 401, { error: 'Credenciales incorrectas o acceso no habilitado' }); return;
      }
      // Responder sin el campo password
      const { password: _pw, ...safeUser } = user;
      json(res, 200, { success: true, usuario: safeUser });
    } catch (e) { json(res, 400, { error: e.message }); }
    return;
  }

  /* ── GET /api/db — lectura completa ── */
  if (url === '/api/db' && method === 'GET') {
    json(res, 200, readDB()); return;
  }

  /* ── CRUD genérico para las 3 colecciones ── */
  for (const [name, crud] of Object.entries(CRUD)) {
    const base  = `/api/${name}`;
    const item  = url.match(new RegExp(`^${base}/(\\d+)$`));

    /* GET /api/:col */
    if (url === base && method === 'GET') {
      json(res, 200, crud.list(readDB())); return;
    }

    /* POST /api/:col */
    if (url === base && method === 'POST') {
      try {
        const body = await parseBody(req);
        const db   = readDB();
        const rec  = crud.create(db, body);
        writeDB(db);
        json(res, 201, rec);
      } catch (e) { json(res, 400, { error: e.message }); }
      return;
    }

    if (item) {
      const id = parseInt(item[1]);

      /* PUT /api/:col/:id */
      if (method === 'PUT') {
        try {
          const body    = await parseBody(req);
          const db      = readDB();
          const updated = crud.update(db, id, body);
          if (!updated) { json(res, 404, { error: 'No encontrado' }); return; }
          writeDB(db);
          json(res, 200, updated);
        } catch (e) { json(res, 400, { error: e.message }); }
        return;
      }

      /* DELETE /api/:col/:id — con guardias relacionales */
      if (method === 'DELETE') {
        const db = readDB();
        if (name === 'desarrolladores' && tieneDesarrollos(db, id)) {
          json(res, 409, { error: 'No se puede eliminar: tiene desarrollos vinculados. Reasígnalos primero.' });
          return;
        }
        if (name === 'desarrollos' && tieneUnidades(db, id)) {
          json(res, 409, { error: 'No se puede eliminar: tiene unidades vinculadas. Reasígnalas primero desde Inventario General.' });
          return;
        }
        if (!crud.remove(db, id)) { json(res, 404, { error: 'No encontrado' }); return; }
        writeDB(db);
        json(res, 200, { ok: true }); return;
      }
    }
  }

  /* ── Configuración: planesPago (array completo) ── */
  if (url === '/api/planesPago' && method === 'GET') {
    json(res, 200, readDB().planesPago || []); return;
  }
  if (url === '/api/planesPago' && method === 'PUT') {
    try {
      const body = await parseBody(req);
      const db = readDB();
      db.planesPago = body;
      writeDB(db);
      json(res, 200, db.planesPago);
    } catch (e) { json(res, 400, { error: e.message }); }
    return;
  }

  /* ── Configuración: descuentosMatriz (objeto) ── */
  if (url === '/api/descuentosMatriz' && method === 'GET') {
    json(res, 200, readDB().descuentosMatriz || {}); return;
  }
  if (url === '/api/descuentosMatriz' && method === 'PUT') {
    try {
      const body = await parseBody(req);
      const db = readDB();
      db.descuentosMatriz = body;
      writeDB(db);
      json(res, 200, db.descuentosMatriz);
    } catch (e) { json(res, 400, { error: e.message }); }
    return;
  }

  /* ── Configuración: asignacionPlanes (objeto) ── */
  if (url === '/api/asignacionPlanes' && method === 'GET') {
    json(res, 200, readDB().asignacionPlanes || {}); return;
  }
  if (url === '/api/asignacionPlanes' && method === 'PUT') {
    try {
      const body = await parseBody(req);
      const db = readDB();
      db.asignacionPlanes = body;
      writeDB(db);
      json(res, 200, db.asignacionPlanes);
    } catch (e) { json(res, 400, { error: e.message }); }
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ┌──────────────────────────────────────────────┐');
  console.log('  │  Ávila Herrera · Servidor local activo       │');
  console.log(`  │  http://localhost:${PORT}                       │`);
  console.log('  │  Ctrl+C para detener                         │');
  console.log('  └──────────────────────────────────────────────┘');
  console.log('');
});
