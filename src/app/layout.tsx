import type { Metadata } from "next";
import "./globals.css";

const title = "PINNED — is your CI running code you chose?";
const description =
  "uses: actions/checkout@v4 is a pointer, not a version. Whoever can move that tag decides what runs in your pipeline, with your secrets. Point this at any public repo.";

export const metadata: Metadata = {
  title,
  description,
  keywords: ["github actions", "supply chain", "pin", "sha", "ci security", "workflow"],
  openGraph: { title, description, type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body>{children}</body></html>
  );
}
