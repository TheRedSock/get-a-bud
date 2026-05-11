export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-semibold">Privacy Policy</h1>
      <p className="mt-6 text-muted-foreground">
        This prototype stores budgeting data in Neon Postgres. Enable Banking private
        keys are encrypted before persistence, and real credentials should only be
        configured in ignored environment files or Vercel project secrets.
      </p>
    </main>
  );
}
