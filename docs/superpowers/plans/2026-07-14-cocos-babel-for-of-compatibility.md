# Cocos Babel For-Of Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the floor-three summon reconciliation compile under Cocos Creator 3.8.8 without changing its runtime behavior.

**Architecture:** Replace the Babel-triggering `for...of` iterable expression with a separately normalized `string[]` local variable. Verify both semantic behavior through Jest and syntax compatibility through an actual Creator `wechatgame` build.

**Tech Stack:** TypeScript, Jest/ts-jest, Cocos Creator 3.8.8, Creator MCP build worker.

## Global Constraints

- PVE core remains framework-free and deterministic.
- Do not modify scenes, prefabs, animation files, or their metadata.
- Preserve the existing altar reconciliation and single floor-settlement path.
- `PersistentExpeditionRuntime.ts` is an untracked file containing pre-existing user work; do not commit the whole file as an isolated compatibility commit.

---

### Task 1: Rewrite the Babel-incompatible iterable

**Files:**
- Modify: `assets/scripts/pve/core/PersistentExpeditionRuntime.ts`
- Test: `test/pve/PersistentObjectiveEventBridge.test.ts`

**Interfaces:**
- Consumes: `objective.data.summonIds` as unknown persisted data.
- Produces: `trackedSummonIds: string[]` for the unchanged reconciliation loop.

- [ ] **Step 1: Preserve the failing-build evidence**

Confirm the Creator project log reports `Property types[0] of TSUnionType expected node to be of a type ["TSType"] but instead got "GenericTypeAnnotation"` while loading `PersistentExpeditionRuntime.ts` in `plugin-transform-for-of`.

- [ ] **Step 2: Replace the iterable expression**

Replace:

```ts
for (const summonId of (objective.data.summonIds as string[] | undefined) ?? []) {
```

with:

```ts
const trackedSummonIds: string[] = Array.isArray(objective.data.summonIds)
  ? objective.data.summonIds.filter((value): value is string => typeof value === 'string')
  : [];
for (const summonId of trackedSummonIds) {
```

This removes the TypeScript union/nullish expression from the `for...of` iterable while defensively rejecting malformed restored IDs.

- [ ] **Step 3: Run semantic and type verification**

Run: `npm run test:pve -- --runInBand PersistentObjectiveEventBridge.test.ts; npm run typecheck`

Expected: all objective bridge tests pass and TypeScript reports no errors.

- [ ] **Step 4: Run the actual Creator build**

Use the connected Creator editor build action for the existing `wechatgame` configuration and wait for completion.

Expected: `buildScriptCommand` passes the previous 28% failure point and the build finishes successfully. If a later independent build-stage error appears, capture and diagnose that new error separately.

- [ ] **Step 5: Run the post-build patch**

Run: `node scripts/patch-wechatgame-config.js`

Expected: output includes `build structure OK`, a critical native manifest summary, and an estimated main package below 4096 KB.
