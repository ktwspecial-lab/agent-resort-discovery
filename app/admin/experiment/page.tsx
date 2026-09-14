import type { Metadata } from 'next';
import AdminExperiment from './AdminExperiment';

export const metadata: Metadata = {
  title: 'Experiment funnel — Agent Resort',
  robots: { index: false, follow: false },
};

export default function ExperimentPage() { return <AdminExperiment />; }
