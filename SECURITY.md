# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |

## Reporting a Vulnerability

**Do not** open a public GitHub issue for security vulnerabilities.

Instead, use [GitHub Private Vulnerability Reporting](https://github.com/olederkach/bcdocker/security/advisories/new) and include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

Response times:

- Acknowledgment: 48 hours
- Initial assessment: 1 week
- Fix: Critical 72h, High 1 week, Medium 2 weeks

## Security Best Practices

### PowerShell Execution

This tool executes PowerShell commands via `powershell.exe` (Windows PowerShell 5.1). All scripts run locally on your machine with your user's permissions.

- Never pass untrusted input as container names or file paths
- The tool uses `-NonInteractive` and `-NoProfile` flags
- No credentials are stored on disk by the tool itself

### MCP Server Mode

When running as an MCP server:

- The server communicates over stdio (local process, no network exposure)
- Container credentials (username/password) are passed per-call, not persisted
- Default credentials (`admin`/`P@ssw0rd!`) are for local dev containers only

### What NOT to Commit

```
# Never commit these:
.env
.mcp.json
*.bclicense
*.flf
```

## Pre-Release Checklist

- [ ] No secrets in repository or commit history
- [ ] No hardcoded org-specific URLs, tokens, or license files
- [ ] `npm audit` shows no vulnerabilities
- [ ] PowerShell scripts validated for injection risks

---

Last Updated: March 2026
