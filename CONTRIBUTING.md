# Contributing

Thanks for your interest in contributing to **bcdocker**!

## Getting Started

1. Fork the repository
2. Clone your fork and install dependencies:
   ```bash
   git clone https://github.com/<your-username>/bcdocker.git
   cd bcdocker
   npm install
   ```
3. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development

```bash
npm run build    # Compile TypeScript
npm run cli      # Run CLI locally
npm run start    # Run MCP server locally
```

## Prerequisites

- **Node.js 18+**
- **Windows** with Docker Desktop in Windows containers mode
- **Windows PowerShell 5.1** (BC management cmdlets require it)
- **BcContainerHelper** PowerShell module

## Code Standards

- **TypeScript** — all source code is in `src/`
- **No hardcoded credentials** — use `<your-...>` placeholders in examples and docs
- **Input validation** — validate all user-facing parameters
- **No org-specific references** — keep the tool generic for any BC developer

## Security

- **Never commit credentials**, API keys, license files, or tenant IDs
- **Report vulnerabilities privately** — see [SECURITY.md](SECURITY.md)
- Review the Security Checklist in the PR template before submitting

## Pull Request Process

1. Ensure `npm run build` passes with 0 errors
2. Ensure `npm audit` shows no new vulnerabilities
3. Fill out the PR template completely
4. PRs are squash-merged into `master`

## Architecture

```
bcd/
├── src/
│   ├── server.ts       # MCP server — 15 tools over stdio
│   ├── cli.ts          # CLI — same 15 operations via command line
│   └── executor.ts     # PowerShell 5.1 execution layer
├── ps/                 # Bundled PowerShell module
│   ├── BCDocker.psm1   # Module loader
│   ├── Container.ps1   # Container lifecycle
│   ├── Apps.ps1        # App management
│   ├── Tests.ps1       # Test runner
│   └── Helpers.ps1     # UI helpers, validation
└── dist/               # Compiled JS (after npm run build)
```

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating,
you are expected to uphold this code.
