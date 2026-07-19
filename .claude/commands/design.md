---
description: Design a new NPR Seminar screen before Opus implementation
argument-hint: <screen brief>
allowed-tools: [Read, Glob, Grep]
model: fable
---

# New screen design

Design the requested screen without editing application code.

First load and follow the installed `frontend-design` skill. Read `AGENTS.md`, `docs/design`, the closest existing routes and components under `apps/web`, and any relevant product specs under `docs/specs`.

Preserve the NPR Seminar product language, tokens, typography, components, and interaction patterns where they already exist. The new screen must feel like part of the same product, not a separate redesign.

Produce a design handoff that includes:

- target user and the screen's single primary job
- reused existing patterns and any genuinely new pattern
- information hierarchy and responsive behavior
- real interface copy and all important empty, loading, error, and success states
- accessibility and keyboard behavior
- a compact token and component mapping
- clear art direction that can be turned into three visual alternatives

Do not implement the screen. The orchestrator will use the Product Design workflow to generate three visual alternatives, wait for the user's selection, and then hand the selected direction to Claude Code Opus for implementation.

Screen brief: $ARGUMENTS
