import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import * as handlers from "./server-handlers.js";

export const server = new McpServer({
  name: "bcd",
  version: "1.0.2",
});

// ── Container Tools ──────────────────────────────────────

server.tool(
  "list-containers",
  "List all Business Central Docker containers with their running status",
  {},
  handlers.handleListContainers
);

server.tool(
  "container-info",
  "Get detailed info about a BC container: version, status, and service endpoints",
  { containerName: z.string().describe("Name of the BC container") },
  handlers.handleContainerInfo
);

server.tool(
  "create-container",
  "Create a new Business Central Docker container with test toolkit. Long-running (5-30 min).",
  {
    containerName: z.string().default("bcsandbox").describe("Docker container name"),
    version: z.string().default("sandbox").describe("BC version: 'sandbox', 'onprem', or specific like '26.0'"),
    country: z.string().default("us").describe("Localization: us, w1, gb, nl, dk, de, etc."),
    userName: z.string().default("admin").describe("Admin username"),
    password: z.string().default("P@ssw0rd!").describe("Admin password"),
    memoryLimit: z.string().default("8G").describe("Memory limit: 8G, 12G, 16G"),
    isolation: z.enum(["hyperv", "process"]).default("hyperv").describe("Isolation mode"),
    testToolkit: z.enum(["none", "libraries", "full"]).default("libraries").describe("Test toolkit: none, libraries (faster), or full (all MS tests)"),
    bypassCDN: z.boolean().default(false).describe("Skip Azure CDN, download from blob storage directly"),
    licenseFile: z.string().optional().describe("Path or URL to .bclicense / .flf license file"),
  },
  handlers.handleCreateContainer
);

server.tool(
  "remove-container",
  "Remove a Business Central Docker container",
  { containerName: z.string().describe("Name of the container to remove") },
  handlers.handleRemoveContainer
);

server.tool(
  "start-container",
  "Start a stopped BC Docker container",
  { containerName: z.string().describe("Name of the container to start") },
  handlers.handleStartContainer
);

server.tool(
  "stop-container",
  "Stop a running BC Docker container",
  { containerName: z.string().describe("Name of the container to stop") },
  handlers.handleStopContainer
);

server.tool(
  "restart-container",
  "Restart a BC Docker container",
  { containerName: z.string().describe("Name of the container to restart") },
  handlers.handleRestartContainer
);

server.tool(
  "open-webclient",
  "Open the BC Web Client URL for a container. Returns the URL.",
  { containerName: z.string().describe("Name of the BC container") },
  handlers.handleOpenWebclient
);

// ── App Tools ────────────────────────────────────────────

server.tool(
  "list-apps",
  "List all apps installed in a BC container, optionally filtered by publisher",
  {
    containerName: z.string().describe("Target container name"),
    publisher: z.string().optional().describe("Filter by publisher (e.g. 'Microsoft')"),
  },
  handlers.handleListApps
);

server.tool(
  "install-app",
  "Publish and install a .app file into a BC container",
  {
    containerName: z.string().describe("Target container name"),
    appFile: z.string().describe("Full path to the .app file"),
    userName: z.string().default("admin").describe("Admin username"),
    password: z.string().default("P@ssw0rd!").describe("Admin password"),
  },
  handlers.handleInstallApp
);

server.tool(
  "uninstall-app",
  "Uninstall an app from a BC container by name. Automatically handles dependency order.",
  {
    containerName: z.string().describe("Target container name"),
    appName: z.string().describe("Name of the app to uninstall"),
    appPublisher: z.string().describe("Publisher of the app"),
  },
  handlers.handleUninstallApp
);

server.tool(
  "publish-project",
  "Compile and publish an AL project folder into a BC container",
  {
    containerName: z.string().describe("Target container name"),
    projectFolder: z.string().describe("Full path to the AL project folder"),
    userName: z.string().default("admin").describe("Admin username"),
    password: z.string().default("P@ssw0rd!").describe("Admin password"),
  },
  handlers.handlePublishProject
);

// ── Test & License Tools ─────────────────────────────────

server.tool(
  "import-test-toolkit",
  "Import the BC Test Toolkit (libraries only or full framework) into a container",
  {
    containerName: z.string().describe("Target container name"),
    librariesOnly: z.boolean().default(true).describe("true = just helper libs (faster), false = full MS test codeunits"),
    userName: z.string().default("admin").describe("Admin username"),
    password: z.string().default("P@ssw0rd!").describe("Admin password"),
  },
  handlers.handleImportTestToolkit
);

server.tool(
  "import-license",
  "Import a license file into a BC container",
  {
    containerName: z.string().describe("Target container name"),
    licenseFile: z.string().describe("Full path or URL to .bclicense / .flf file"),
  },
  handlers.handleImportLicense
);

server.tool(
  "run-tests",
  "Run AL tests in a BC container. Can run all tests, a specific codeunit, or compile-and-run from a project folder.",
  {
    containerName: z.string().default("bcsandbox").describe("Target container name"),
    testCodeunitId: z.number().optional().describe("Specific test codeunit ID (omit for all)"),
    testFunctionName: z.string().optional().describe("Specific test function name"),
    appProjectFolder: z.string().optional().describe("AL test project folder to compile/publish/run"),
    userName: z.string().default("admin").describe("Admin username"),
    password: z.string().default("P@ssw0rd!").describe("Admin password"),
  },
  handlers.handleRunTests
);

// ── Start ────────────────────────────────────────────────

export async function startMcpServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isMainModule =
  process.argv[1] &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isMainModule) {
  startMcpServer().catch((err) => {
    console.error("MCP server failed:", err);
    process.exit(1);
  });
}
