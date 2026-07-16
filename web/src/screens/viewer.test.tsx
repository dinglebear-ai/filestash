import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ViewerScreen, extOf, getMimeType, opener } from "./viewer";

const pluginApi = vi.hoisted(() => ({ list: vi.fn() }));
const filesApi = vi.hoisted(() => ({ catUrl: vi.fn((path: string) => `/cat?path=${path}`) }));
const back = vi.hoisted(() => vi.fn());
const config = { mime: { png: "image/png", pdf: "application/pdf" } };

vi.mock("@/lib/api/endpoints", () => ({ filesApi, pluginApi }));
vi.mock("@/lib/config/config-context", () => ({ useConfig: () => ({ config, base: "/" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back }) }));

function renderViewer(pathname: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ViewerScreen pathname={pathname} /></QueryClientProvider>);
}

describe("viewer selection", () => {
  beforeEach(() => { vi.clearAllMocks(); pluginApi.list.mockResolvedValue({}); });

  it("covers built-in MIME and extension opener contracts", () => {
    const mimes = {
      txt: "text/plain", pdf: "application/pdf", png: "image/png", js: "application/javascript",
      mp3: "audio/mp3", form: "application/x-form", geo: "application/geo+json", mp4: "video/mp4",
      epub: "application/epub+zip", url: "application/x-url", zip: "application/zip",
    };
    expect(extOf("A.TXT")).toBe("txt");
    expect(getMimeType("unknown", mimes)).toBe("text/plain");
    expect(opener("model.stl", mimes)).toBe("3d");
    expect(opener("data.csv", mimes)).toBe("table");
    expect(opener("a.txt", mimes)).toBe("editor");
    expect(opener("a.pdf", mimes)).toBe("pdf");
    expect(opener("a.png", mimes)).toBe("image");
    expect(opener("a.js", mimes)).toBe("editor");
    expect(opener("a.mp3", mimes)).toBe("audio");
    expect(opener("a.form", mimes)).toBe("form");
    expect(opener("a.geo", mimes)).toBe("map");
    expect(opener("a.mp4", mimes)).toBe("video");
    expect(opener("a.epub", mimes)).toBe("ebook");
    expect(opener("a.url", mimes)).toBe("url");
    expect(opener("a.zip", mimes)).toBe("download");
  });

  it("renders a built-in image viewer", async () => {
    renderViewer("/view/photos/logo.png");
    expect(await screen.findByRole("img", { name: "logo.png" })).toHaveAttribute("src", "/cat?path=/photos/logo.png");
  });

  it("gives a matching runtime plugin precedence", async () => {
    pluginApi.list.mockResolvedValue({ "image/png": ["skeleton", "/legacy.js"] });
    renderViewer("/view/logo.png");
    expect(await screen.findByText(/targets the legacy skeleton host/)).toBeInTheDocument();
  });
});
