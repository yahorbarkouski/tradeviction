"use client";

import { type ReactNode, useState } from "react";

// A form submit that asks first. Renders as one button; a click swaps it for
// an inline "sure? yes / no" so a destructive action is never one tap away.
// Hidden inputs go in children and end up inside the form.
export function Confirm({
  action,
  label,
  className,
  children,
  question = "sure?",
  yes = "yes",
  no = "no",
  ariaLabel,
  disabled,
  title,
}: {
  action: (formData: FormData) => void | Promise<void>;
  label: ReactNode;
  className: string;
  children?: ReactNode;
  question?: string;
  yes?: string;
  no?: string;
  ariaLabel?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => setAsking(true)}
        aria-label={ariaLabel}
        disabled={disabled}
        title={title}
      >
        {label}
      </button>
    );
  }
  return (
    <form action={action} className="contents">
      {children}
      <span className="text-mute" aria-live="polite">
        {question}{" "}
      </span>
      <button type="submit" className={className} disabled={disabled} aria-label={ariaLabel} autoFocus>
        {yes}
      </button>
      <span className="text-mute"> / </span>
      <button type="button" className={className} onClick={() => setAsking(false)}>
        {no}
      </button>
    </form>
  );
}
