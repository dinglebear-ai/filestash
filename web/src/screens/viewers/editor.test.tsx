import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditorViewer from "./editor";

vi.mock("@uiw/react-codemirror", () => ({ default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <textarea aria-label="editor" value={value} onChange={(event) => onChange(event.target.value)} /> }));
vi.mock("@uiw/codemirror-theme-tokyo-night", () => ({ tokyoNight: {} }));

describe("editor route identity", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("never presents stale content from a superseded file request", async () => {
    const pending = new Map<string, (value: Response) => void>();
    vi.stubGlobal("fetch", vi.fn((src: string) => new Promise<Response>((resolve) => pending.set(src, resolve))));
    const view = render(<EditorViewer src="/api/a" path="/a.txt" />);
    view.rerender(<EditorViewer src="/api/b" path="/b.txt" />);
    await act(async () => pending.get("/api/a")?.(new Response("content-a")));
    expect(screen.queryByLabelText("editor")).not.toBeInTheDocument();
    await act(async () => pending.get("/api/b")?.(new Response("content-b")));
    expect(await screen.findByLabelText("editor")).toHaveValue("content-b");
  });
});
