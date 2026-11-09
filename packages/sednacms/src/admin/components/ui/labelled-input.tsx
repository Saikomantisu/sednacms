import type { InputHTMLAttributes } from 'react';

export function LabelledInput({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <div className="field">
      <label htmlFor={props.id}>{label}</label>
      <input
        {...props}
        aria-describedby={
          [props['aria-describedby'], hint ? `${props.id}-hint` : null].filter(Boolean).join(' ') ||
          undefined
        }
      />
      {hint && (
        <p id={`${props.id}-hint`} className="hint">
          {hint}
        </p>
      )}
    </div>
  );
}
