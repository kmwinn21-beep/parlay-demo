import Link from 'next/link';
import { requireOpsAdminPage } from '@/lib/opsAuth';

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireOpsAdminPage();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 overflow-x-auto flex-nowrap hide-scrollbar min-w-0">
          <span className="font-bold text-gray-900 text-lg tracking-tight flex-shrink-0">Parlay</span>
          <Link href="/ops/accounts" className="text-sm text-gray-600 hover:text-gray-900 flex-shrink-0">
            Accounts
          </Link>
          <Link href="/ops/metrics" className="text-sm text-gray-600 hover:text-gray-900 flex-shrink-0">
            Metrics
          </Link>
          <Link href="/ops/simulator" className="text-sm text-gray-600 hover:text-gray-900 flex-shrink-0">
            Simulator
          </Link>
          <Link href="/ops/generator" className="text-sm text-gray-600 hover:text-gray-900 flex-shrink-0">
            Generator
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-600 flex-shrink-0">
          <span className="hidden sm:inline truncate max-w-[180px]">{admin.email}</span>
          <Link href="/api/auth/logout" className="text-gray-500 hover:text-gray-800 whitespace-nowrap">
            Sign out
          </Link>
        </div>
      </nav>
      <main className="p-4 sm:p-6">{children}</main>
    </div>
  );
}
