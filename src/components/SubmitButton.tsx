'use client';

import { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * Form submit button that disables itself while the server action runs
 */
export default function SubmitButton({
  children,
  pendingText,
  className,
}: {
  children: ReactNode;
  pendingText: string;
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={`${className} disabled:opacity-60`}>
      {pending ? pendingText : children}
    </button>
  );
}
