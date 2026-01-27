# Historical Documentation Archive

This directory contains documentation related to **protocol issues** that were present in `claude-flow` v3.0.0-alpha.3 through v3.0.0-alpha.118 and **fixed upstream** in v3.0.0-alpha.119+.

## Context

The router v2.0 implemented workarounds for these upstream issues:
- **Stdout Pollution**: Logs corrupting JSON-RPC stream
- **Handshake Timeouts**: Initialization taking > 5 seconds
- **Tool Limit Overflow**: 175+ tools exceeding client limits
- **Brittle Notification Handling**: Unknown notifications causing crashes

## Resolution

All these issues were **addressed by the claude-flow community** in v3.0.0-alpha.119+ (see [GitHub Issue #954](https://github.com/ruvnet/claude-flow/issues/954)).

Router v3.0+ **removes these workarounds** and relies on upstream fixes. The router now focuses exclusively on **AISP enforcement** for multi-agent pipelines.

## Archived Documents

- **`GITHUB_ISSUE_MCP_ROBUSTNESS.md`**: Detailed technical analysis of protocol violations
- **`claude_flow_issue_alpha3.md`**: Original bug report and proposed fixes

These are preserved for historical context and reference.
