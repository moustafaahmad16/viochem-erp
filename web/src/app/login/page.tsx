import { ActionForm, Field, Submit } from "@/components/forms";
import { login } from "./actions";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-accent-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Viochem for Trading and Industry" className="mx-auto h-24 w-auto" />
          <div className="mt-1 text-sm text-slate-500">Aroma chemicals · Imports · Sales</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <ActionForm action={login}>
            <Field label="Email" name="email" type="email" autoComplete="email" required autoFocus />
            <Field label="Password" name="password" type="password" autoComplete="current-password" required />
            <div className="pt-1 [&>button]:w-full">
              <Submit>Sign in</Submit>
            </div>
          </ActionForm>
        </div>
      </div>
    </main>
  );
}
