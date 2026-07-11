interface PlaceholderProps {
  name: string;
  detail?: string;
}

/** Stage 0 stub. Real screens arrive in Stages 3–5. */
export default function Placeholder({ name, detail }: PlaceholderProps) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="rounded-tag border-2 border-ink bg-paper-deep px-8 py-6 shadow-tag">
        <h1 className="font-display text-2xl">{name}</h1>
        {detail !== undefined && <p className="mt-2 font-mono text-sm text-ink-soft">{detail}</p>}
      </div>
    </main>
  );
}
