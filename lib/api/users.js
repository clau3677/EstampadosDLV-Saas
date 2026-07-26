// GET /api/users — lista de usuarios (solo campos públicos, sin passwordHash)
import { COLLECTIONS, strip } from '@/lib/models';
import { json } from './_helpers';

export default async function handleUsers(ctx) {
  const { method, route, request, db } = ctx;

  if (route !== '/users' || method !== 'GET') return null;

  const url = new URL(request.url);
  const role = url.searchParams.get('role');
  const q = role ? { role } : {};

  const rows = await db.collection(COLLECTIONS.USERS)
    .find(q, { projection: { passwordHash: 0 } })
    .sort({ fullName: 1 })
    .toArray();

  return json(strip(rows));
}
