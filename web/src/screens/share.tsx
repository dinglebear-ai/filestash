"use client";

// Shared-link page — faithful port of the share proof flow. POST proof (empty to
// start), which returns the next required step ("password" | "email" | "code") or
// an empty key meaning authorized. On success, redirect into the file browser /
// viewer scoped to the share (the proof establishes the share session cookie).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { shareApi } from "@/lib/api/endpoints";
import { Input } from "@/registry/aurora/ui/input";
import { Button } from "@/registry/aurora/ui/button";

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
        router.replace(isDir ? `/files${path}?share=${shareId}` : `/view${path}?share=${shareId}&nav=false`);
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

  // Kick off the flow once.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void submit(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (step === "loading") return <Centered>Opening shared link…</Centered>;
  if (step === "error") return <Centered>This shared link is unavailable.</Centered>;

  const labels: Record<string, string> = {
    password: "Password",
    email: "Your email address",
    code: "Verification code",
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-5 px-6">
      <h1 className="aurora-text-section text-center">Protected share</h1>
      <form
        className="flex flex-col gap-3 rounded-[var(--aurora-radius-3)] p-6"
        style={{ background: "var(--aurora-panel-strong)", border: "1px solid var(--aurora-border-strong)" }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit({ type: step, value });
        }}
      >
        <div className="flex items-center gap-2">
          <Input
            type={step === "password" ? "password" : step === "email" ? "email" : "text"}
            value={value}
            placeholder={labels[step] ?? "Value"}
            error={failed}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
          />
          <Button type="submit" variant="aurora" size="icon" disabled={busy}>
            <ArrowRight size={16} />
          </Button>
        </div>
        {failed ? <p className="aurora-text-body-sm text-[var(--aurora-error)]">Incorrect, try again.</p> : null}
      </form>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <p className="aurora-text-body text-[var(--aurora-text-muted)]">{children}</p>
    </main>
  );
}
