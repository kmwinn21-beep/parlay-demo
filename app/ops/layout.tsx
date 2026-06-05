import Link from 'next/link';
import { requireOpsAdminPage } from '@/lib/opsAuth';

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireOpsAdminPage();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <span className="font-bold text-gray-900 text-lg tracking-tight">Parlay</span>
          <Link href="/ops/accounts" className="text-sm text-gray-600 hover:text-gray-900">
            Accounts
          </Link>
          <Link href="/ops/metrics" className="text-sm text-gray-600 hover:text-gray-900">
            Metrics
          </Link>
          <Link href="/ops/simulator" className="text-sm text-gray-600 hover:text-gray-900">
            Simulator
          </Link>
          <Link href="/ops/generator" className="text-sm text-gray-600 hover:text-gray-900">
            Generator
          </Link>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>{admin.email}</span>
          <Link href="/api/auth/logout" className="text-gray-500 hover:text-gray-800">
            Sign out
          </Link>
        </div>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
