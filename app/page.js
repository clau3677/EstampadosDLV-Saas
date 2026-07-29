// Página raíz — Server Component
// Siempre redirige a /tienda (la tienda pública).
import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/tienda');
}
