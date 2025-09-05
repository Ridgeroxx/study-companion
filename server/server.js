import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mime from 'mime';
import initSqlJs from 'sql.js';

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

const app = express();
app.use(cors({
  origin: ['http://127.0.0.1:3000', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '4mb' }));

// Upload dir
const uploadsDir = path.resolve('./server/uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({ dest: uploadsDir });

/* ---------------- SQLite via sql.js (pure JS) ---------------- */
const dbFile = path.resolve('./server/data.sqlite');
const SQL = await initSqlJs();

const db = fs.existsSync(dbFile)
  ? new SQL.Database(fs.readFileSync(dbFile))
  : new SQL.Database();

function persist(){ try { fs.writeFileSync(dbFile, Buffer.from(db.export())); } catch(e){ console.error('Persist failed', e); } }
function exec(sql, params=[]){
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
}
function all(sql, params=[]){
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
function get(sql, params=[]){ const r = all(sql, params); return r[0] || null; }
function lastInsertId(){ return all('SELECT last_insert_rowid() AS id')[0]?.id; }

// schema
db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  name TEXT,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  userId INTEGER NOT NULL,
  title TEXT,
  type TEXT,
  meta TEXT,
  lastOpened TEXT,
  updatedAt TEXT
);
CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  userId INTEGER NOT NULL,
  docId TEXT NOT NULL,
  kind TEXT,
  quote TEXT,
  note TEXT,
  tags TEXT,
  cfi TEXT,
  createdAt TEXT,
  updatedAt TEXT
);
CREATE TABLE IF NOT EXISTS prefs (
  userId INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (userId, key)
);
CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY,
  userId INTEGER NOT NULL,
  title TEXT,
  mime TEXT,
  path TEXT,
  size INTEGER,
  createdAt TEXT
);
`);

/* ---------------- Helpers ---------------- */
function tokenFor(user){ return jwt.sign({ uid: user.id, email: user.email }, JWT_SECRET, { expiresIn: '14d' }); }
function auth(req, res, next){
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  try { const data = jwt.verify(tok, JWT_SECRET); req.user = data; next(); }
  catch { return res.status(401).json({ error: 'Unauthorized' }); }
}

/* ---------------- Auth ---------------- */
app.post('/api/auth/register', (req,res)=>{
  const { email, password, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error:'Missing fields' });
  const exists = get('SELECT id FROM users WHERE email = ?', [email]);
  if (exists) return res.status(409).json({ error:'Email in use' });
  const passwordHash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();
  exec('INSERT INTO users (email, passwordHash, name, createdAt) VALUES (?, ?, ?, ?)', [email, passwordHash, name||'', now]);
  const id = lastInsertId();
  const u = get('SELECT id,email,name FROM users WHERE id = ?', [id]);
  persist();
  res.json({ token: tokenFor(u), user: u });
});

app.post('/api/auth/login', (req,res)=>{
  const { email, password } = req.body || {};
  const user = get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) return res.status(401).json({ error:'Invalid credentials' });
  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error:'Invalid credentials' });
  res.json({ token: tokenFor(user), user: { id:user.id, email:user.email, name:user.name } });
});

app.get('/api/me', auth, (req,res)=>{
  const u = get('SELECT id,email,name FROM users WHERE id = ?', [req.user.uid]);
  res.json(u);
});

/* ---------------- Docs ---------------- */
app.get('/api/docs', auth, (req,res)=>{
  const rows = all('SELECT * FROM docs WHERE userId = ?', [req.user.uid]).map(r => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null }));
  res.json(rows);
});
app.post('/api/docs', auth, (req,res)=>{
  const d = req.body || {};
  const meta = JSON.stringify(d.meta || null);
  // upsert
  exec(`
    INSERT INTO docs (id,userId,title,type,meta,lastOpened,updatedAt)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,type=excluded.type,meta=excluded.meta,lastOpened=excluded.lastOpened,updatedAt=excluded.updatedAt
  `, [d.id, req.user.uid, d.title||'', d.type||'', meta, d.lastOpened||null, d.updatedAt||new Date().toISOString()]);
  persist();
  res.json({ ok:true });
});
app.delete('/api/docs/:id', auth, (req,res)=>{
  exec('DELETE FROM docs WHERE id = ? AND userId = ?', [req.params.id, req.user.uid]);
  persist();
  res.json({ ok:true });
});

/* ---------------- Annotations ---------------- */
app.get('/api/annotations', auth, (req,res)=>{
  const rows = all('SELECT * FROM annotations WHERE userId = ?', [req.user.uid]).map(r => ({ ...r, tags: r.tags ? JSON.parse(r.tags) : [] }));
  res.json(rows);
});
app.post('/api/annotations', auth, (req,res)=>{
  const a = req.body || {};
  const tags = JSON.stringify(a.tags || []);
  exec(`
    INSERT INTO annotations (id,userId,docId,kind,quote,note,tags,cfi,createdAt,updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      kind=excluded.kind, quote=excluded.quote, note=excluded.note, tags=excluded.tags, cfi=excluded.cfi, updatedAt=excluded.updatedAt
  `, [a.id, req.user.uid, a.docId, a.kind||'', a.quote||'', a.note||'', tags, a.cfi||null, a.createdAt||new Date().toISOString(), a.updatedAt||new Date().toISOString()]);
  persist();
  res.json({ ok:true });
});
app.delete('/api/annotations/:id', auth, (req,res)=>{
  exec('DELETE FROM annotations WHERE id = ? AND userId = ?', [req.params.id, req.user.uid]);
  persist();
  res.json({ ok:true });
});

/* ---------------- Prefs ---------------- */
app.get('/api/prefs/:key', auth, (req,res)=>{
  const row = get('SELECT value FROM prefs WHERE userId = ? AND key = ?', [req.user.uid, req.params.key]);
  res.json({ value: row ? JSON.parse(row.value) : null });
});
app.post('/api/prefs/:key', auth, (req,res)=>{
  const val = JSON.stringify(req.body?.value ?? null);
  exec(`
    INSERT INTO prefs (userId, key, value) VALUES (?, ?, ?)
    ON CONFLICT(userId,key) DO UPDATE SET value=excluded.value
  `, [req.user.uid, req.params.key, val]);
  persist();
  res.json({ ok:true });
});

/* ---------------- Recordings ---------------- */
app.get('/api/recordings', auth, (req,res)=>{
  const rows = all('SELECT id,title,mime,size,createdAt FROM recordings WHERE userId = ? ORDER BY createdAt DESC', [req.user.uid]);
  res.json(rows);
});
app.get('/api/recordings/:id', auth, (req,res)=>{
  const r = get('SELECT * FROM recordings WHERE id = ? AND userId = ?', [req.params.id, req.user.uid]);
  if (!r) return res.sendStatus(404);
  res.setHeader('Content-Type', r.mime || 'application/octet-stream');
  res.setHeader('Content-Length', r.size || 0);
  fs.createReadStream(r.path).pipe(res);
});
app.post('/api/recordings', auth, upload.single('file'), (req,res)=>{
  const id = req.body.id || `rec_${Date.now()}`;
  const title = req.body.title || 'Talk';
  const file = req.file;
  if (!file) return res.status(400).json({ error:'No file' });
  const ext = '.' + (mime.getExtension(file.mimetype) || 'webm');
  const finalPath = path.join(uploadsDir, id + ext);
  fs.renameSync(file.path, finalPath);
  exec(`
    INSERT INTO recordings (id,userId,title,mime,path,size,createdAt)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title
  `, [id, req.user.uid, title, file.mimetype, finalPath, file.size, new Date().toISOString()]);
  persist();
  res.json({ ok:true, id });
});
app.delete('/api/recordings/:id', auth, (req,res)=>{
  const r = get('SELECT * FROM recordings WHERE id = ? AND userId = ?', [req.params.id, req.user.uid]);
  if (r) { try { fs.unlinkSync(r.path); } catch {} }
  exec('DELETE FROM recordings WHERE id = ? AND userId = ?', [req.params.id, req.user.uid]);
  persist();
  res.json({ ok:true });
});

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Point this to the folder that contains app.html (adjust as needed)
const CLIENT_DIR = path.join(__dirname, '..'); // e.g., project root

// Serve static files (CSS/JS/assets)
app.use(express.static(CLIENT_DIR, { extensions: ['html'] }));

// Root -> app.html
app.get('/', (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'app.html'));
});

// Optional SPA fallback (keep AFTER all /api routes)
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'app.html'));
});


app.listen(PORT, ()=> console.log(`API on http://localhost:${PORT}`));
