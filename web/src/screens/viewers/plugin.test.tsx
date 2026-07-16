import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PluginViewer } from "./plugin";

const props = { name: "report.bin", mime: "application/octet-stream", path: "/report.bin", src: "/api/files/cat?path=%2Freport.bin" };

describe("versioned viewer plugin host", () => {
  it("reports legacy host incompatibility explicitly", () => {
    render(<PluginViewer {...props} application="skeleton" entrypoint="/legacy.js" />);
    expect(screen.getByText(/targets the legacy skeleton host/)).toBeInTheDocument();
  });

  it("isolates iframe plugins and passes file identity as parameters", () => {
    render(<PluginViewer {...props} application="iframe" entrypoint="https://plugins.example/view" />);
    const frame = screen.getByTitle("report.bin");
    expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-forms allow-downloads");
    expect(frame.getAttribute("src")).toContain("name=report.bin");
    expect(frame.getAttribute("src")).toContain("mime=application%2Foctet-stream");
  });

  it("mounts a v1 plugin module", async () => {
    const entrypoint = 'data:text/javascript,export default {apiVersion:"filestash-react-viewer-v1",mount(root){root.textContent="plugin mounted"}}';
    render(<PluginViewer {...props} application="filestash-react-viewer-v1" entrypoint={entrypoint} />);
    expect(await screen.findByText("plugin mounted")).toBeInTheDocument();
  });
});
