import { MongoClient } from 'mongodb';
import { ensureIndexes } from './mongo-indexes';

// Promise-cached singleton para evitar race conditions cuando múltiples
// requests paralelos llaman a getDb() antes de que el primero termine de
// conectar. Todos comparten la misma Promise pendiente.

let dbPromise = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const client = new MongoClient(process.env.MONGO_URL, {
        maxPoolSize: 20,
      });
      await client.connect();
      const db = client.db(process.env.DB_NAME);
      // Asegurar índices en background sin bloquear la respuesta (fire-and-forget).
      // ensureIndexes es idempotente y sólo corre una vez por proceso.
      ensureIndexes(db).catch((e) => {
        console.warn('[mongo] ensureIndexes failed:', e?.message);
      });
      return db;
    })().catch((err) => {
      // Si la conexión falla, resetear para permitir reintentos
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export async function coll(name) {
  const database = await getDb();
  return database.collection(name);
}
