export const metadata = {
  title: 'trajekt',
  description: 'Ton agent, enfin lisible.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, background: '#10131A', color: '#ECEAE4' }}>{children}</body>
    </html>
  );
}
