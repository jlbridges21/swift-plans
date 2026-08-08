import { SignUpForm } from "@/components/auth/SignUpForm";

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-navy">
          Create account
        </h1>
        <p className="text-sm text-fg-muted">
          Start building floor plans in minutes.
        </p>
      </header>
      <SignUpForm />
    </div>
  );
}
