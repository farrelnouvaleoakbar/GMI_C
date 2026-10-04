import { redirect, notFound } from "next/navigation";
import { configured } from "@/lib/supabase";
import { requireStaff } from "@/lib/auth";
import { Workspace } from "@/components/workspace";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { section } = await params;
  if (
    ![
      "dashboard",
      "products",
      "customers",
      "pricing",
      "drafts",
      "invoices",
      "payments",
      "settings",
      "staff",
      "audit",
      "account",
    ].includes(section)
  )
    notFound();
  if (!configured()) redirect("/login");
  let session: Awaited<ReturnType<typeof requireStaff>>;
  try {
    session = await requireStaff();
  } catch {
    redirect("/login");
  }
  if (
    ["settings", "staff", "audit"].includes(section) &&
    session.profile.role !== "admin"
  )
    redirect("/dashboard");
  if (
    ["pricing", "drafts"].includes(section) &&
    session.profile.role === "finance"
  )
    redirect("/dashboard");
  if (section === "payments" && session.profile.role === "sales")
    redirect("/dashboard");
  const query = await searchParams;
  return (
    <Workspace
      key={section + JSON.stringify(query)}
      initialInvoiceId={typeof query.id === "string" ? query.id : undefined}
      profile={session.profile}
      section={section}
    />
  );
}
