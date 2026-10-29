# Agents Board Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a persisted board view and stable split-sidebar Agents experience while preserving the existing phone list and pane detail behavior.

**Architecture:** Extract the Agents root screen into dedicated components backed by pure board selection, persistence, last-viewed, and route-decision helpers. AppShell selects a stable Agents sidebar component for Agents routes and redirects the split root route to a valid remembered/preferred pane without remounting the sidebar across pane changes.

**Tech Stack:** React 18, TypeScript, React Router, Vitest, CSS, Capacitor Android, Playwright screenshot fixture.

---

### Task 1: Board and persistence models

**Files:**
- Create: `src/herdr/agentsBoardModel.ts`
- Test: `src/herdr/agentsBoardModel.test.ts`
- Modify: `src/herdr/model.ts`

1. Write failing tests for workspace ordering/counts, selected workspace fallback, view-mode storage, last-viewed pane resolution, and split route decision.
2. Run the focused tests and confirm expected failures.
3. Implement minimal pure helpers and add optional last-change model data.
4. Run focused tests and commit.

### Task 2: Extract and build Agents list/board UI

**Files:**
- Create: `src/herdr/AgentsScreen.tsx`
- Create: `src/herdr/AgentsBoard.tsx`
- Create: `src/herdr/AgentsSidebar.tsx`
- Modify: `src/herdr/HerdrScreens.tsx`
- Modify: `src/i18n/en/agents.ts`
- Modify: `src/i18n/zh/agents.ts`
- Modify: `src/styles.css`

1. Move the current list screen without changing pane detail code.
2. Add the persisted board switcher, selected workspace mute action, selected pane state, relative time, list/board toggle, and conditional remote screen action.
3. Add compact sidebar rendering using the same stable component type.
4. Run typecheck/tests and commit.

### Task 3: Split shell integration

**Files:**
- Modify: `src/layout/AppShell.tsx`
- Modify: `src/layout/splitLayout.ts`
- Modify: `src/layout/splitLayout.test.ts`

1. Write failing tests for Agents route classification and sidebar choice.
2. Add the stable Agents sidebar branch and split-root replacement redirect.
3. Ensure phone root retains tab bar and detail hides it.
4. Run focused tests and commit.

### Task 4: Screenshot fixture and visual verification

**Files:**
- Modify: `scripts/screenshots/capture.mjs`

1. Extend synthetic Herdr fixtures to at least four long-name workspaces and several agents.
2. Add 412px English/Chinese board, 412px list, and 884px split captures with overflow assertions.
3. Run the requested screenshot command and inspect generated paths.
4. Commit fixture changes.

### Task 5: Final verification and cleanup

1. Remove this temporary plan file.
2. Run `npm run check` unpiped and record exact counts/return code; on load timeout stop Gradle and rerun once.
3. Run `npm run android:build` and record the result.
4. Verify git diff/status and commit cleanup.
