"use client";

// Shared-link page — faithful port of the share proof flow. POST proof (empty to
// start), which returns the next required step ("password" | "email" | "code") or
// an empty key meaning authorized. On success, redirect into the file browser /
// viewer scoped to the share (the proof establishes the share session cookie).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { shareApi } from "@/lib/api/endpoints";
import { Button } from "@/registry/aurora/ui/button";
import { Callout } from "@/registry/aurora/ui/callout";
import { Card, CardContent, CardHeader, CardTitle } from "@/registry/aurora/ui/card";
import { Field } from "@/registry/aurora/ui/field";
import { Input } from "@/registry/aurora/ui/input";
import { InputOTP } from "@/registry/aurora/ui/input-otp";
import { Spinner } from "@/registry/aurora/ui/spinner";
import { withBase } from "@/lib/paths";

type Step = "loading" | "password" | "email" | "code" | "error";

export function ShareScreen({ pathname }: { pathname: string }) {
  const router = useRouter();
  const shareId = pathname.replace(/^\/s\//, "").replace(/\/$/, "");
  const [step, setStep] = useState<Step>("loading");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  const submit = async (body: Record<string, string> | null) => {
    setBusy(true);
    setFailed(false);
    try {
      const { key = "", path = "/" } = await shareApi.proof(shareId, body);
      if (key === "") {
        const isDir = path.endsWith("/");
        router.replace(withBase(isDir ? `/files${path}?share=${shareId}` : `/view${path}?share=${shareId}&nav=false`));
      } else {
        setStep(key as Step);
        setValue("");
      }
    } catch {
      setFailed(true);
      if (step === "loading") setStep("error");
    } finally {
      setBusy(false);
    }
  };

  // AppRouter keys this screen by pathname, so each share gets isolated proof state.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void submit(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (step === "loading") return <Centered loading>Opening shared link</Centered>;
  if (step === "error") return <Centered>This shared link is unavailable.</Centered>;

  const labels: Record<string, string> = {
    password: "Password",
    email: "Your email address",
    code: "Verification code",
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-5 px-6">
      <header className="grid gap-2 text-center">
        <p className="aurora-text-eyebrow text-[var(--aurora-text-muted)]">filestash</p>
        <h1 className="aurora-text-section">Protected share</h1>
        <p className="aurora-text-body-sm text-[var(--aurora-text-muted)]">
          Enter the proof requested by the owner to open this shared file.
        </p>
      </header>
      <Card elevated>
        <CardContent className="p-6">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit({ type: step, value });
            }}
          >
            <Field
              label={labels[step] ?? "Value"}
              error={failed ? "Incorrect, try again." : undefined}
              required
            >
              {step === "code" ? (
                <InputOTP value={value} onChange={setValue} />
              ) : (
                <Input
                  type={step === "password" ? "password" : step === "email" ? "email" : "text"}
                  value={value}
                  placeholder={labels[step] ?? "Value"}
                  error={failed}
                  autoFocus
                  required
                  onChange={(e) => setValue(e.target.value)}
                />
              )}
            </Field>
            {failed ? (
              <Callout variant="error" title="Proof rejected">
                Check the value and try again.
              </Callout>
            ) : null}
            <Button type="submit" variant="aurora" loading={busy} disabled={busy || !value.trim()}>
              Continue <ArrowRight size={16} />
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function Centered({ children, loading = false }: { children: React.ReactNode; loading?: boolean }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <Card>
        <CardHeader className="items-center text-center">
          {loading ? <Spinner /> : null}
          <CardTitle as="h1">{children}</CardTitle>
        </CardHeader>
      </Card>
    </main>
  );
}
