import { SignInForm } from "@/components/auth/SignInForm";

export const dynamic = "force-dynamic";

type SignInPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-navy">
          Sign in
        </h1>
        <p className="text-sm text-fg-muted">
          Welcome back. Sign in to continue your floor plans.
        </p>
      </header>
      <SignInForm initialError={params.error} />
    </div>
  );
}
