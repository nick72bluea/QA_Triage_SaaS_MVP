// We disable the global DashboardLayout wrapper for the Admin routes
// because the new bespoke Admin page has its own integrated dark sidebar!

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}