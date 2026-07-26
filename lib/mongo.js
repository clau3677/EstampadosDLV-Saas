import { MongoClient } from 'mongodb';

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
      return client.db(process.env.DB_NAME);
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
