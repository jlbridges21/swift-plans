import type { Metadata } from "next";
import { PublicPlanClient } from "@/components/public/PublicPlanClient";
import { getPublishedPlanBySlug } from "@/lib/projects/published";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

function Unavailable() {
  return (
    <main
      className={[
        "mx-auto flex min-h-dvh w-full max-w-lg flex-col items-start justify-center gap-3 px-5",
        "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
      ].join(" ")}
    >
      <h1 className="text-2xl font-semibold tracking-tight text-navy">
        This floor plan isn’t available
      </h1>
      <p className="text-base text-fg-muted">
        It may have been unpublished or the link may be incorrect.
      </p>
    </main>
  );
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const plan = await getPublishedPlanBySlug(slug);
  if (!plan) {
    return { title: "Floor plan unavailable", robots: { index: false } };
  }
  return {
    title: plan.projectName,
    description: `Interactive floor plan — ${plan.projectName}`,
  };
}

export default async function PublicPlanPage({ params }: PageProps) {
  const { slug } = await params;
  const plan = await getPublishedPlanBySlug(slug);
  if (!plan || plan.floors.length === 0) {
    return <Unavailable />;
  }
  return (
    <main className="fixed inset-0 overflow-hidden bg-paper">
      <PublicPlanClient plan={plan} />
    </main>
  );
}
