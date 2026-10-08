"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { formatDate } from "@/lib/dates";
import { buttonClass } from "./ui";

export type FormState = { error?: string; ok?: string } | undefined;
type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const PendingContext = createContext(false);

/**
 * A form that runs a server action and shows its error message, if any.
 * What was typed stays in the fields when the action fails, so nobody has to fill a form twice.
 */
export function ActionForm({ action, children, className = "space-y-4", resetOnSuccess = false }: { action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      action={formAction}
      onSubmit={(e) => {
        // Submitting by hand stops React from clearing the fields afterwards.
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {state?.error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</div>}
      {state?.ok && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.ok}</div>}
      <div className={className}>
        <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
      </div>
    </form>
  );
}

export function Submit({ children, variant = "primary", confirm }: { children: ReactNode; variant?: "primary" | "secondary" | "danger"; confirm?: string }) {
  const formPending = useFormStatus().pending;
  const actionPending = useContext(PendingContext);
  const pending = formPending || actionPending;
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass(variant)}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

const inputClass =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

type FieldProps = { label: string; name: string; hint?: string; className?: string };

/** Label, control and hint, wired together so the hint is read out but isn't part of the label. */
function Labelled({ label, hint, className, children }: { label: string; hint?: string; className: string; children: (id: string, hintId?: string) => ReactNode }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children(id, hintId)}
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Field({ label, name, hint, className = "", ...input }: FieldProps & React.InputHTMLAttributes<HTMLInputElement>) {
  if (input.type === "date") return <DateField label={label} name={name} hint={hint} className={className} {...input} />;
  return <Labelled label={label} hint={hint} className={className}>{(id, hintId) => <input id={id} name={name} aria-describedby={hintId} className={inputClass} {...input} />}</Labelled>;
}

/**
 * Browsers show date boxes in the computer's own order (often month first), which is how dates got
 * mixed up before. So the chosen date is always repeated underneath as "20 Aug 2026".
 */
function DateField({ label, name, hint, className = "", defaultValue, onChange, ...input }: FieldProps & React.InputHTMLAttributes<HTMLInputElement>) {
  const [value, setValue] = useState(String(defaultValue ?? ""));
  const shown = value ? formatDate(new Date(`${value}T00:00:00Z`)) : "";
  return (
    <Labelled label={label} hint={hint} className={className}>
      {(id, hintId) => (
        <>
          <input
            id={id}
            name={name}
            aria-describedby={hintId}
            className={inputClass}
            defaultValue={defaultValue}
            onChange={(e) => {
              setValue(e.target.value);
              onChange?.(e);
            }}
            {...input}
          />
          <p className="mt-1 h-4 text-xs font-medium text-brand-700">{shown}</p>
        </>
      )}
    </Labelled>
  );
}

export function TextArea({ label, name, hint, className = "", ...input }: FieldProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <Labelled label={label} hint={hint} className={className}>{(id, hintId) => <textarea id={id} name={name} rows={3} aria-describedby={hintId} className={inputClass} {...input} />}</Labelled>;
}

export function Select({ label, name, hint, className = "", options, placeholder, ...input }: FieldProps & React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string | number; label: string }[]; placeholder?: string }) {
  return (
    <Labelled label={label} hint={hint} className={className}>
      {(id, hintId) => (
        <select id={id} name={name} aria-describedby={hintId} className={inputClass} {...input}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Labelled>
  );
}
