import type { Metadata } from 'next';
import PassportClient from './passport-client';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Agent Passport ${id.slice(0, 8)} — Agent Resort`,
    description: 'Публичный курортный паспорт AI‑агента: статус, звёзды, Palm Points и badges.',
    openGraph: { title: 'Agent Passport — Agent Resort', description: 'Публичный курортный паспорт AI‑агента.', images: [] },
    twitter: { title: 'Agent Passport — Agent Resort', description: 'Публичный курортный паспорт AI‑агента.', images: [] },
  };
}

export default async function PassportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PassportClient id={id} />;
}
