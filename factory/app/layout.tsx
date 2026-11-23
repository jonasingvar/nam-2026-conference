export const metadata = { title: 'ORBIT factory', description: 'GitHub issues become reviewed, deployed pull requests.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'ui-sans-serif, system-ui', margin: 0, background: '#0b0d12', color: '#e6e8ee' }}>{children}</body>
    </html>
  );
}
