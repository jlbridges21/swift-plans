import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { getUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const user = await getUser();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Choose a new password
        </h1>
        <p className="text-sm text-fg-muted">
          Enter a new password for your Swift Plans account.
        </p>
      </header>
      <ResetPasswordForm hasSession={Boolean(user)} />
    </div>
  );
}
