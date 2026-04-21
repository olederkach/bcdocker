# bcdocker

MCP server and CLI for **Business Central Docker** container management. Run via `npx` -- no install needed.

```bash
npx bcdocker list              # list containers
npx bcdocker create            # create a BC sandbox
npx bcdocker test bcsandbox    # run AL tests
```

## Quick start

### As MCP server (AI assistants)

Zero-install -- add to your IDE config and your AI can manage BC containers directly:

**Cursor** (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "bcd": {
      "command": "npx",
      "args": ["-y", "bcdocker", "mcp"]
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bcd": {
      "command": "npx",
      "args": ["-y", "bcdocker", "mcp"]
    }
  }
}
```

**VS Code / Copilot** (`.vscode/mcp.json`):

```json
{
  "servers": {
    "bcd": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "bcdocker", "mcp"]
    }
  }
}
```

Once configured, ask your AI assistant things like:

- "List my BC containers"
- "Create a new BC sandbox with version 26.0"
- "Show me the apps in bcsandbox"
- "Run tests in my container"
- "Compile and publish my AL project"

### As CLI

**Via npx (no install):**

```bash
npx bcdocker list
npx bcdocker info bcsandbox
npx bcdocker create --name bcsandbox --type sandbox --bc-version 26.0 --country w1 --bypass-cdn
npx bcdocker start bcsandbox
npx bcdocker stop bcsandbox
npx bcdocker apps bcsandbox --publisher Microsoft
npx bcdocker test bcsandbox --codeunit 50100
```

**Global install** (puts `bcd` on your PATH):

```bash
npm i -g bcdocker
bcd list
bcd create --name mybc --bc-version 26.0
bcd test mybc
```

## Prerequisites

- **Node.js 18+**
- **Windows PowerShell 5.1** (BC management cmdlets require it)
- **Docker Desktop** in Windows containers mode

The npm package bundles the PowerShell module in `ps/`. Override with `BCD_MODULE_PATH` if needed.

## CLI commands

| Command | Description |
|---|---|
| `list` / `ls` | List all BC containers with status |
| `info <container>` | Show version, status, and endpoints |
| `create` | Create a new BC container (5-30 min) |
| `remove <container>` | Remove a container |
| `start <container>` | Start a stopped container |
| `stop <container>` | Stop a running container |
| `restart <container>` | Restart a container |
| `open <container>` | Open BC Web Client in browser |
| `apps <container>` | List apps (optional `--publisher`) |
| `install <container> <appFile>` | Install a .app file |
| `uninstall <container> <app> <publisher>` | Uninstall an app |
| `publish <container> <folder>` | Compile and publish an AL project |
| `test [container]` | Run AL tests (optional `--codeunit`, `--function`, `--app`) |
| `toolkit <container>` | Import test toolkit (`--full` for all) |
| `license <container> <file>` | Import a license file |

## MCP tools

The same 15 operations exposed as MCP tools for AI assistants:

`list-containers` `container-info` `create-container` `remove-container` `start-container` `stop-container` `restart-container` `open-webclient` `list-apps` `install-app` `uninstall-app` `publish-project` `run-tests` `import-test-toolkit` `import-license`

## Naming

| Term | What it is |
|------|------------|
| **`bcdocker`** | This npm package and GitHub repo. |
| **`bcd`** | The CLI command after global install (`npm i -g bcdocker`). |
| **`bcdocker-toolkit`** | The PowerShell + Windows UI repo (module **BCDocker**). Different repo. |

## Related

- **[bcdocker-toolkit](https://github.com/olederkach/bcdocker-toolkit)** -- PowerShell module and Windows UI for Business Central Docker containers

## Migrating from 1.x to 2.0

Breaking changes in 2.0:

- **MCP server invocation**: add `"mcp"` arg to your MCP client config. The previous config `"args": ["-y", "bcdocker"]` ran the CLI (which showed help instead of starting the MCP server). New: `"args": ["-y", "bcdocker", "mcp"]`.
- **`bcd create` flags**: the `--version` flag (which actually meant "artifact type") is replaced by `--type sandbox|onprem` and `-v, --bc-version <version>`. Previously `bcd create --version sandbox` → now `bcd create --type sandbox`. A specific BC version like `28.0` now works: `bcd create --bc-version 28.0`.
- **MCP `create-container` schema**: the `version` field is split into `type` (enum: sandbox, onprem) and `bcVersion` (string, e.g. `"28.0"` or empty for latest).
- **MCP tool responses**: handlers now surface stderr and non-zero exit codes as `Failed:\n...` text instead of returning the confident fallback message. AI clients will get actionable failure details instead of spurious "complete" messages.

## License

MIT
