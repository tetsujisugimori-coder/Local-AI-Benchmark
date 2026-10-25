import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Public Benchmark Viewer",
  description:
    "検証済み形式の公開ベンチマーク記録を閲覧・条件付き比較する静的ビューア",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
