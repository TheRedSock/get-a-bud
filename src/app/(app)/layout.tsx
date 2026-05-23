import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { AppHeader } from "@/components/app-header";
import { AppNav } from "@/components/app-nav";
import { PipelineShell } from "@/components/pipeline/pipeline-shell";
import { authOptions } from "@/lib/auth/options";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/sign-in");
  }

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="px-4 pb-28 sm:px-6 lg:ml-80 lg:px-8 lg:pb-10">
        <AppHeader title="Your money cockpit" />
        <PipelineShell>{children}</PipelineShell>
      </main>
    </div>
  );
}
