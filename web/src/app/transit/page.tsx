import TransitPageClient from './pageClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function TransitPage() {
  return <TransitPageClient />;
}
