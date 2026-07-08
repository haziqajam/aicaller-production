import type { Metadata } from "next";

// The (auth) pages (e.g. login) are client components and can't export
// `metadata` themselves, so this server-component layout supplies the title.
// Combined with the root `title.template` ("%s · AI Caller") this renders the
// tab title as "Sign in · AI Caller".
export const metadata: Metadata = {
  title: "Sign in",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
