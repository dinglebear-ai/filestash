"use client";

// Renders a Filestash backend login Form (server/common.Form) as Aurora fields.
// Faithful to the legacy connect form: flattens optional sub-groups, supports the
// `enable` toggle that reveals its `target` fields, and submits all values.
import { useMemo, useState } from "react";
import { Field } from "@/registry/aurora/ui/field";
import { Input } from "@/registry/aurora/ui/input";
import { Switch } from "@/registry/aurora/ui/switch";
import { Button } from "@/registry/aurora/ui/button";
import type { BackendForm, FormElement } from "@/lib/api/types";

function flatten(form: BackendForm): FormElement[] {
  const out: FormElement[] = [...(form.Elmnts ?? [])];
  for (const sub of form.Form ?? []) out.push(...flatten(sub));
  return out;
}

function initialValues(elements: FormElement[]): Record<string, string> {
  const v: Record<string, string> = {};
  for (const el of elements) {
    const raw = el.value ?? el.default ?? "";
    v[el.label] = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
  }
  return v;
}

export function DynamicForm({
  form,
  submitting,
  error,
  onSubmit,
}: {
  form: BackendForm;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const elements = useMemo(() => flatten(form), [form]);
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(elements));
  // `enable` toggles → on/off, keyed by the toggle's field name.
  const [toggles, setToggles] = useState<Record<string, boolean>>({});

  // id → name of the enable toggle that controls it (for visibility).
  const controlledBy = useMemo(() => {
    const map: Record<string, string> = {};
    for (const el of elements) {
      if (el.type === "enable") for (const t of el.target ?? []) map[t] = el.label;
    }
    return map;
  }, [elements]);

  const isVisible = (el: FormElement) => {
    const controller = el.id ? controlledBy[el.id] : undefined;
    return !controller || toggles[controller];
  };

  const set = (name: string, value: string) => setValues((v) => ({ ...v, [name]: value }));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
    >
      {elements.map((el, i) => {
        if (el.type === "hidden") return null;
        if (!isVisible(el)) return null;
        const label = el.placeholder || el.label;
        const key = el.id || el.label || String(i);

        if (el.type === "enable") {
          return (
            <div key={key} className="flex items-center justify-between gap-3">
              <span className="aurora-text-label">{label}</span>
              <Switch
                checked={Boolean(toggles[el.label])}
                onCheckedChange={(on: boolean) => setToggles((t) => ({ ...t, [el.label]: on }))}
              />
            </div>
          );
        }

        if (el.type === "boolean") {
          return (
            <div key={key} className="flex items-center justify-between gap-3">
              <span className="aurora-text-label">{label}</span>
              <Switch
                checked={values[el.label] === "true"}
                onCheckedChange={(on: boolean) => set(el.label, on ? "true" : "false")}
              />
            </div>
          );
        }

        if (el.type === "select") {
          return (
            <Field key={key} label={label} required={el.required}>
              <select
                className="h-9 rounded-[var(--aurora-radius-1)] border bg-[var(--aurora-control-surface)] px-3 aurora-text-control"
                style={{ borderColor: "var(--aurora-border-strong)" }}
                value={values[el.label] ?? ""}
                onChange={(e) => set(el.label, e.target.value)}
              >
                {(el.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </Field>
          );
        }

        const inputType =
          el.type === "password" || el.type === "long_password"
            ? "password"
            : el.type === "number"
              ? "number"
              : el.type === "email"
                ? "email"
                : "text";

        return (
          <Field key={key} label={label} description={el.description} required={el.required}>
            <Input
              type={inputType}
              value={values[el.label] ?? ""}
              placeholder={el.placeholder}
              readOnly={el.readonly}
              required={el.required}
              list={el.datalist?.length ? `${key}-list` : undefined}
              onChange={(e) => set(el.label, e.target.value)}
            />
            {el.datalist?.length ? (
              <datalist id={`${key}-list`}>
                {el.datalist.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            ) : null}
          </Field>
        );
      })}

      {error ? (
        <p className="aurora-text-body-sm text-[var(--aurora-error)]">{error}</p>
      ) : null}

      <Button type="submit" variant="aurora" disabled={submitting}>
        {submitting ? "Connecting…" : "Connect"}
      </Button>
    </form>
  );
}
