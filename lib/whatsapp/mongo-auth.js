// ============================================================================
// Baileys Auth State adapter — persiste `creds` y `keys` en MongoDB
//
// Reemplaza `useMultiFileAuthState` (que usa archivos locales) por
// almacenamiento en 2 colecciones:
//   - whatsapp_auth  → 1 documento único { id: 'creds', data: <credsJSON> }
//   - whatsapp_keys  → 1 documento por (type, keyId): { id: 'type:keyId', data }
//
// Esto permite mantener la sesión de WhatsApp entre reinicios del contenedor
// sin depender del filesystem (útil en Docker/K8s ephemeral).
// ============================================================================
import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import { getDb } from '@/lib/mongo';

const CREDS_COLL = 'whatsapp_auth';
const KEYS_COLL = 'whatsapp_keys';

// serializa un objeto Baileys (con Buffers) a plain JSON usable por Mongo
const ser = (v) => JSON.parse(JSON.stringify(v, BufferJSON.replacer));
// deserializa desde Mongo → objeto Baileys con Buffers restaurados
const deser = (v) => JSON.parse(JSON.stringify(v), BufferJSON.reviver);

export async function getMongoAuthState() {
  const db = await getDb();
  const authColl = db.collection(CREDS_COLL);
  const keysColl = db.collection(KEYS_COLL);

  // Cargar creds existentes o inicializar nuevas
  const doc = await authColl.findOne({ id: 'creds' });
  const creds = doc?.data ? deser(doc.data) : initAuthCreds();

  const readKey = async (type, id) => {
    const key = `${type}:${id}`;
    const row = await keysColl.findOne({ id: key });
    return row?.data ? deser(row.data) : null;
  };

  const writeKey = async (type, id, value) => {
    const key = `${type}:${id}`;
    if (value === null || value === undefined) {
      await keysColl.deleteOne({ id: key });
    } else {
      await keysColl.updateOne(
        { id: key },
        { $set: { id: key, type, keyId: id, data: ser(value), updatedAt: new Date() } },
        { upsert: true },
      );
    }
  };

  const state = {
    creds,
    keys: {
      get: async (type, ids) => {
        const out = {};
        await Promise.all(ids.map(async (id) => {
          const v = await readKey(type, id);
          if (v) {
            // app-state-sync-key deber envolverse en proto.Message.AppStateSyncKeyData
            out[id] = type === 'app-state-sync-key' && v ? v : v;
          }
        }));
        return out;
      },
      set: async (data) => {
        const tasks = [];
        for (const type of Object.keys(data)) {
          for (const id of Object.keys(data[type])) {
            const value = data[type][id];
            tasks.push(writeKey(type, id, value));
          }
        }
        await Promise.all(tasks);
      },
    },
  };

  const saveCreds = async () => {
    await authColl.updateOne(
      { id: 'creds' },
      { $set: { id: 'creds', data: ser(state.creds), updatedAt: new Date() } },
      { upsert: true },
    );
  };

  return { state, saveCreds, clear: async () => {
    await authColl.deleteMany({});
    await keysColl.deleteMany({});
  } };
}
