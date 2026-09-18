import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DB_PATH = path.resolve('data/db.json');
const DATABASE_URL = process.env.DATABASE_URL || '';
let queue = Promise.resolve();
let poolPromise = null;
let schemaReady = false;

export function id(prefix='id') {
  return `${prefix}_${crypto.randomBytes(8).toString('base64url')}`;
}

function emptyState(){
  return {users:[],projects:[],media:[],events:[],responses:[]};
}

async function ensureJsonDb() {
  try { await fs.access(DB_PATH); }
  catch {
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    await fs.writeFile(DB_PATH, JSON.stringify(emptyState(), null, 2));
  }
}

async function getPool(){
  if(!DATABASE_URL) return null;
  if(!poolPromise){
    poolPromise = import('pg').then(({Pool}) => new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.PGSSL === 'disable' ? false : (process.env.NODE_ENV === 'production' ? {rejectUnauthorized:false} : undefined),
      max: Number(process.env.PG_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000
    }));
  }
  const pool = await poolPromise;
  if(!schemaReady){
    await pool.query(`
      CREATE TABLE IF NOT EXISTS emora_state (
        id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      INSERT INTO emora_state (id, payload)
      VALUES (1, '{"users":[],"projects":[],"media":[],"events":[],"responses":[]}'::jsonb)
      ON CONFLICT (id) DO NOTHING;
    `);
    schemaReady = true;
  }
  return pool;
}

export function storeMode(){ return DATABASE_URL ? 'postgres' : 'json'; }

export async function readDb() {
  if(DATABASE_URL){
    const pool = await getPool();
    const {rows} = await pool.query('SELECT payload FROM emora_state WHERE id=1');
    return rows[0]?.payload || emptyState();
  }
  await ensureJsonDb();
  const raw = await fs.readFile(DB_PATH, 'utf8');
  return JSON.parse(raw);
}

export async function writeDb(db) {
  if(DATABASE_URL){
    const pool = await getPool();
    await pool.query('UPDATE emora_state SET payload=$1::jsonb, updated_at=NOW() WHERE id=1',[JSON.stringify(db)]);
    return;
  }
  await ensureJsonDb();
  const tmp = `${DB_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DB_PATH);
}

export function mutate(fn) {
  if(DATABASE_URL){
    return (async()=>{
      const pool = await getPool();
      const client = await pool.connect();
      try{
        await client.query('BEGIN');
        const {rows} = await client.query('SELECT payload FROM emora_state WHERE id=1 FOR UPDATE');
        const db = rows[0]?.payload || emptyState();
        const result = await fn(db);
        await client.query('UPDATE emora_state SET payload=$1::jsonb, updated_at=NOW() WHERE id=1',[JSON.stringify(db)]);
        await client.query('COMMIT');
        return result;
      }catch(e){
        await client.query('ROLLBACK').catch(()=>{});
        throw e;
      }finally{ client.release(); }
    })();
  }
  queue = queue.then(async () => {
    const db = await readDb();
    const result = await fn(db);
    await writeDb(db);
    return result;
  });
  return queue;
}

export async function pingStore(){
  if(DATABASE_URL){
    const pool = await getPool();
    await pool.query('SELECT 1');
    return true;
  }
  await ensureJsonDb();
  return true;
}

export async function getProject(projectId) {
  const db = await readDb();
  return db.projects.find(p => p.id === projectId) || null;
}

export async function getProjectBySlug(slug) {
  const db = await readDb();
  return db.projects.find(p => p.slug === slug && p.publishedAt) || null;
}

export async function getProjectBySubdomain(subdomain) {
  const db = await readDb();
  return db.projects.find(p => p.customSubdomain === subdomain && p.publishedAt) || null;
}
