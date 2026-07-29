// Página raíz — Server Component
// Redirige a /tienda para visitantes no autenticados.
// Si hay sesión admin/operator, renderiza el Dashboard.
import { getUserFromCookies } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import DashboardPage from './dashboard';

export default async function RootPage() {
  const user = await getUserFromCookies();

  // No autenticado → ir a la tienda pública
  if (!user) {
    redirect('/tienda');
  }

  // Autenticado pero NO admin/operator → ir a mi-cuenta
  if (user.role !== 'admin' && user.role !== 'operator') {
    redirect('/mi-cuenta');
  }

  // Admin/Operator → Dashboard
  return <DashboardPage />;
}
