import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-navy">
          Reset password
        </h1>
        <p className="text-sm text-fg-muted">
          Enter your email and we’ll send a reset link if an account exists.
        </p>
      </header>
      <ForgotPasswordForm />
    </div>
  );
}
