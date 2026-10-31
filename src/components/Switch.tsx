"use client";

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition duration-200 ${
        checked ? "bg-brand" : "bg-line"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <span
        className={`h-5 w-5 rounded-full shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-5 bg-brand-ink" : "translate-x-0 bg-surface"
        }`}
      />
    </button>
  );
}
