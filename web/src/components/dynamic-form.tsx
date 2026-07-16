"use client";

// Renders a Filestash backend login Form (server/common.Form) as Aurora fields.
// Faithful to the legacy connect form: flattens optional sub-groups, supports the
// `enable` toggle that reveals its `target` fields, and submits all values.
import { useMemo, useState } from "react";
import { Field } from "@/registry/aurora/ui/field";
import { Input } from "@/registry/aurora/ui/input";
import { NativeSelect } from "@/registry/aurora/ui/native-select";
import { Switch } from "@/registry/aurora/ui/switch";
import { Button } from "@/registry/aurora/ui/button";
import { Callout } from "@/registry/aurora/ui/callout";
import type { FormElement, FormFields } from "@/lib/api/types";

function initialValues(elements: FormElement[]): Record<string, string> {
  const v: Record<string, string> = {};
  for (const el of elements) {
    const raw = el.value ?? el.default ?? "";
    v[el.label] = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
  }
  return v;
}

export function DynamicForm({
  fields,
  submitting,
  error,
  onSubmit,
}: {
  fields: FormFields;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (values: Record<string, string>) => void;
}) {
  // Object insertion order = display order (verified against /api/backend).
  const elements = useMemo(() => Object.values(fields), [fields]);
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
        const inputId = `connection-${String(key).replace(/[^a-zA-Z0-9_-]/g, "-")}`;

        if (el.type === "enable") {
          return (
            <div key={key} className="flex items-center justify-between gap-3">
              <span className="aurora-text-label">{label}</span>
              <Switch
                aria-label={String(label)}
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
                aria-label={String(label)}
                checked={values[el.label] === "true"}
                onCheckedChange={(on: boolean) => set(el.label, on ? "true" : "false")}
              />
            </div>
          );
        }

        if (el.type === "select") {
          return (
            <Field key={key} label={label} htmlFor={inputId} required={el.required}>
              <NativeSelect
                id={inputId}
                value={values[el.label] ?? ""}
                onChange={(e) => set(el.label, e.target.value)}
              >
                {(el.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </NativeSelect>
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
          <Field key={key} label={label} htmlFor={inputId} description={el.description} required={el.required}>
            <Input
              id={inputId}
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
        <Callout title="Could not connect" variant="error">
          {error}
        </Callout>
      ) : null}

      <Button type="submit" variant="aurora" disabled={submitting} loading={submitting}>
        {submitting ? "Connecting…" : "Connect"}
      </Button>
    </form>
  );
}
