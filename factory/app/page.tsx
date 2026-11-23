export default function Page() {
  return (
    <main style={{ maxWidth: 640, margin: '10vh auto', padding: '0 16px', lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>🏭 ORBIT factory</h1>
      <p style={{ color: '#9aa1ae', marginTop: 0 }}>Ship on Vercel</p>
      <p>
        Label an issue in <a style={{ color: '#7aa7ff' }} href="https://github.com/jonasingvar/nam-2026-conference/issues">jonasingvar/nam-2026-conference</a>{' '}
        <code>ready-for-ai</code>, or comment <code>/ship</code> on it. A durable Vercel Workflow sizes it with Jev, builds it with Claude Code in a
        Vercel Sandbox, gates and audits it, opens the pull request, reviews it on its Vercel preview, waits for your merge, and checks production.
      </p>
      <p style={{ color: '#9aa1ae' }}>Progress lives on the issue; every step is in the project&apos;s Workflows tab.</p>
    </main>
  );
}
