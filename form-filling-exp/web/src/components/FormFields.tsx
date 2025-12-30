'use client';

import { FormField } from '@/types';

interface FormFieldsProps {
  fields: FormField[];
}

function FieldTypeIcon({ type }: { type: FormField['field_type'] }) {
  const iconClass = "w-3.5 h-3.5";

  switch (type) {
    case 'text':
      return (
        <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
        </svg>
      );
    case 'checkbox':
      return (
        <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'dropdown':
      return (
        <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      );
    case 'radio':
      return (
        <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="12" r="9" strokeWidth={2} />
          <circle cx="12" cy="12" r="4" fill="currentColor" />
        </svg>
      );
  }
}

export default function FormFields({ fields }: FormFieldsProps) {
  if (fields.length === 0) {
    return (
      <div className="text-center py-8 text-foreground-muted">
        <p>No form fields detected</p>
        <p className="text-sm mt-1">Upload a PDF with fillable form fields</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground-secondary">
          Detected Fields
        </h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent">
          {fields.length} fields
        </span>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
        {fields.map((field, index) => (
          <div
            key={`${field.field_id}-${index}`}
            className="p-3 rounded-lg bg-background-tertiary border border-border/50"
          >
            <div className="flex items-center justify-between mb-1">
              <code className="text-xs text-accent font-mono truncate max-w-[200px]">
                {field.field_id}
              </code>
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-background-secondary text-foreground-muted">
                <FieldTypeIcon type={field.field_type} />
                {field.field_type}
              </span>
            </div>

            <p className="text-xs text-foreground-secondary line-clamp-2">
              {field.label_context || 'No context'}
            </p>

            {field.options && field.options.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {field.options.slice(0, 3).map((opt) => (
                  <span key={opt} className="text-xs px-1.5 py-0.5 rounded bg-background-secondary text-foreground-muted">
                    {opt}
                  </span>
                ))}
                {field.options.length > 3 && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-background-secondary text-foreground-muted">
                    +{field.options.length - 3} more
                  </span>
                )}
              </div>
            )}

            {field.current_value && (
              <div className="mt-2 text-xs">
                <span className="text-foreground-muted">Current: </span>
                <span className="text-foreground-secondary">{field.current_value}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
