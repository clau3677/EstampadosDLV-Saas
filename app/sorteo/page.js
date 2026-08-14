import { Metadata } from 'next';
import { SorteoLive } from '@/components/sorteo-live';

export const metadata = {
  title: 'Sorteo en Vivo — Estampados DLV',
  robots: { index: false, follow: false },
};

export default function SorteoPage() {
  return <SorteoLive />;
}
