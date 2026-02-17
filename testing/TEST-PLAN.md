# Sequential Queue Test Plan

**Author:** QA (Expert)
**Date:** 2026-02-16
**Status:** Design Phase (Awaiting ARCHIE + CODER implementation)

---

## Executive Summary

This test plan provides comprehensive coverage for Sequential Queue enhancements, focusing on three critical areas:

1. **Iteration Loop Testing** - Verify automatic workflow restart on critical gaps
2. **Error Handling** - Ensure graceful failure recovery
3. **Integration Testing** - Validate end-to-end workflow execution

---

## Testing Environment

**Queue Location:** `~/skill-sequential-agent-queue/`

**Prerequisites for Testing:**
- [ ] ARCHIE architecture review complete
- [ ] CODER implementation complete
- [ ] Test workflows created
- [ ] OpenClaw agent CLI functional

---

## Test Area 1: Iteration Loop Testing

### Purpose
Verify automatic workflow iteration when critical gaps are detected in the final stage output.

### Criticality: **HIGH**
These tests validate the core iteration feature that enables gap-informed workflow execution.

---

### 1.1 Basic Iteration Functionality

#### TC-1.1.1: Normal Flow (No Iteration)
**Description:** Workflow with no critical gaps should complete in one pass without restarting.

**Setup:**
- Create workflow with `iterationEnabled: true`
- Last stage (GAP-ANALYSIS) returns: `evidence.gaps: []` (no gaps)
- `maxIterations: 3`

**Expected:**
- Workflow executes all stages once
- `iteration.status` = `"no-gaps"`
- `iteration.current` = `0` (no restarts)
- No `[iteration-X] Critical gaps detected` log messages

**Test Steps:**
1. Load test workflow `test/iteration-no-gaps.json`
2. Execute workflow via `executeWorkflow()`
3. Verify completion status
4. Check iteration status in result
5. Verify no iteration restart occurred

**Evidence Required:**
- Workflow result JSON showing `iteration.status: "no-gaps"`
- Log output showing workflow completed once
- Stage outputs for all 9 stages

---

#### TC-1.1.2: Single Iteration (Critical Gaps Detected, Then Resolved)
**Description:** Workflow restarts once when critical gaps detected, then completes on second pass.

**Setup:**
- Create workflow with `iterationEnabled: true`
- Last stage (Iteration 0) returns: `evidence.gaps: [{priority: "HIGH", status: "open"}]`
- Last stage (Iteration 1) returns: `evidence.gaps: []` (resolved)
- `maxIterations: 3`

**Expected:**
- First pass: Stages execute, critical gaps detected
- Workflow restarts from Stage 0
- Second pass: All stages execute again
- `iteration.status` = `"no-gaps"`
- `iteration.current` = `1` (one restart)
- `iteration.previousIterations.length` = `1`

**Test Steps:**
1. Load test workflow with mock gap response
2. Execute workflow
3. Verify first iteration completed
4. Verify restart triggered
5. Verify second iteration completed with no gaps
6. Check iteration history preserved

**Evidence Required:**
- Workflow result showing `iteration.current: 1`
- Log output showing both iterations
- `iteration.previousIterations[0]` contains first iteration's gaps

---

#### TC-1.1.3: Max Iterations Reached (Persistent Critical Gaps)
**Description:** Workflow stops after max iterations if critical gaps persist.

**Setup:**
- Create workflow with `iterationEnabled: true`, `maxIterations: 3`
- All 3 iterations return: `evidence.gaps: [{priority: "HIGH", status: "open"}]`
- Gaps never resolved

**Expected:**
- 3 iterations complete (0, 1, 2)
- Workflow stops after iteration 3 (max reached)
- `iteration.status` = `"reached-max"`
- `iteration.current` = `2`
- `iteration.previousIterations.length` = `3`

**Test Steps:**
1. Load test workflow with persistent gaps
2. Execute workflow
3. Verify 3 iterations executed
4. Verify workflow stopped after max iterations
5. Check no restart attempted after iteration 3

**Evidence Required:**
- Workflow result showing `iteration.status: "reached-max"`
- Log output showing 3 iterations
- No restart attempt after iteration 3

---

### 1.2 Iteration Counter Testing

#### TC-1.2.1: Counter Increments Correctly
**Description:** Verify iteration counter increments on each restart.

**Setup:**
- `maxIterations: 5`
- 3 iterations execute (gaps persist)

**Expected:**
- Iteration 0: `iteration.current = 0`
- Iteration 1: `iteration.current = 1`
- Iteration 2: `iteration.current = 2`

**Evidence Required:**
- Log output shows `[iteration-0]`, `[iteration-1]`, `[iteration-2]`
- Result JSON shows correct `current` value

---

#### TC-1.2.2: Counter Resets on New Workflow
**Description:** Counter should start at 0 for new workflow executions.

**Setup:**
- Execute workflow (completes after 2 iterations)
- Execute same workflow again from scratch

**Expected:**
- First run: `iteration.current: 2` (2 iterations completed)
- Second run: `iteration.current: 0` (fresh start)

---

### 1.3 Iteration Enable/Disable

#### TC-1.3.1: Iteration Disabled (No Restart Even With Critical Gaps)
**Description:** Workflow should not restart when `iterationEnabled: false`.

**Setup:**
- `iterationEnabled: false`
- Last stage returns critical gaps

**Expected:**
- Workflow completes once
- `iteration.status` = `"not-enabled"`
- No restart attempted

**Evidence Required:**
- Result JSON showing `iteration.status: "not-enabled"`
- Log showing no iteration restart

---

#### TC-1.3.2: Iteration Enabled Explicit Override
**Description:** Workflow should restart when `iterationEnabled: true` (explicit set).

**Setup:**
- `iterationEnabled: true` (explicit value)
- Last stage returns critical gaps

**Expected:**
- Workflow restarts normally
- `iteration.status` = `"restart-detected"`

---

### 1.4 Edge Cases

#### TC-1.4.1: Gap at Different Stages (Last Stage Not GAP-ANALYSIS)
**Description:** Gap detection should work regardless of which stage is last.

**Setup:**
- Last stage is "TESTING" (not "GAP-ANALYSIS")
- TESTING stage returns evidence with gaps

**Expected:**
- Gap detection works correctly
- Iteration restart triggered if gaps critical

---

#### TC-1.4.2: Multiple Critical Gaps
**Description:** Handle multiple critical gaps in final stage output.

**Setup:**
- Last stage returns: `evidence.gaps: [{priority: "HIGH", status: "open"}, {priority: "HIGH", status: "in-progress"}, {priority: "HIGH", status: "deferred"}]`

**Expected:**
- 2 critical gaps detected (2 HIGH-priority, unresolved)
- Iteration restart triggered
- `gapCheck.count: 2`

**Evidence Required:**
- Log showing `Critical gaps detected (2 gaps)`
- Result includes `gaps: [...]` array

---

#### TC-1.4.3: Critical Gap in Middle Stages (Ignored)
**Description:** Gaps in non-final stages should NOT trigger iteration.

**Setup:**
- Stage 3 (not last) returns evidence with critical gaps
- Last stage (Stage 9) returns no gaps

**Expected:**
- Workflow completes normally
- No iteration restart triggered

**Rationale:** Only final stage gaps trigger iteration (gap-informed redraft pattern).

---

#### TC-1.4.4: Iteration With Stage Failures
**Description:** If any stage fails during iteration, workflow should stop (not restart).

**Setup:**
- First iteration: All stages pass, critical gaps detected
- Second iteration: Stage 5 fails

**Expected:**
- Workflow stops at failed stage
- `iteration.status` = `"not-enabled"` (failed before completion)
- No restart after failure

---

#### TC-1.4.5: Zero Max Iterations
**Description:** Workflow should complete immediately if `maxIterations: 0`.

**Setup:**
- `maxIterations: 0`
- Critical gaps detected

**Expected:**
- Workflow completes (no restart allowed)
- `iteration.status` = `"reached-max"`
- `iteration.current: 0`

---

### 1.5 Critical Gap Detection Accuracy

#### TC-1.5.1: Evidence JSON Parsing (Preferred Method)
**Description:** Verify gap detection via evidence JSON (preferred method).

**Setup:**
- Last stage saves evidence JSON with gaps array
- File path: `last-stage/evidence.json`

**Expected:**
- Gaps parsed correctly from JSON
- Detection accurate for priority and status

**Evidence Required:**
- Evidence JSON file exists and is valid
- Correct gaps extracted from JSON
- Result matches expected

---

#### TC-1.5.2: Transcript Fallback (When Evidence JSON Missing)
**Description:** Verify gap detection via transcript parsing (fallback method).

**Setup:**
- Last stage transcript contains: "Gap with high priority detected"
- No evidence JSON file

**Expected:**
- Gap detected via regex pattern matching
- Pattern: `/gap\s+high|high\s+gap|critical\s+gap|priority:\s*high/gi`

**Evidence Required:**
- Transcript contains gap mentions
- Gap detected via fallback method
- Log indicates "transcript fallback used"

---

#### TC-1.5.3: Priority Filtering (HIGH vs MED vs LOW)
**Description:** Only HIGH priority gaps should trigger iteration.

**Setup:**
- Evidence JSON returns:
  ```json
  {
    "gaps": [
      {"priority": "HIGH", "status": "open"},
      {"priority": "MEDIUM", "status": "open"},
      {"priority": "LOW", "status": "open"}
    ]
  }
  ```

**Expected:**
- Only HIGH priority gap triggers iteration
- MEDIUM and LOW gaps ignored for iteration logic

**Evidence Required:**
- `gapCheck.count: 1` (only HIGH gap)
- Iteration restart triggered

---

#### TC-1.5.4: Status Filtering (Resolved/Deferred/Mitigated Gaps Ignored)
**Description:** Resolved, deferred, mitigated, or accepted-risk gaps should NOT trigger iteration.

**Setup:**
- Evidence JSON returns:
  ```json
  {
    "gaps": [
      {"priority": "HIGH", "status": "resolved"},
      {"priority": "HIGH", "status": "deferred"},
      {"priority": "HIGH", "status": "mitigated"},
      {"priority": "HIGH", "status": "accepted-risk"}
    ]
  }
  ```

**Expected:**
- No iteration restart triggered
- `gapCheck.hasCriticalGaps: false`

**Evidence Required:**
- Log shows gaps detected but none critical
- Workflow completes normally

---

## Test Area 2: Error Handling

### Purpose
Verify graceful handling of errors and failures throughout workflow execution.

### Criticality: **HALF**
Half of tests focus on error handling (balance of success path + failure path testing per VERIFICATION_PROTOCOL.md).

---

### 2.1 Agent Spawn Failure Handling

#### TC-2.1.1: Spawn Failure at Stage Start
**Description:** Handle agent spawn failure when `sessions_spawn` returns error.

**Setup:**
- Mock spawner function that throws error: "Failed to spawn agent"
- Stage: `stage-1-design`

**Expected:**
- Stage failure captured in `stageOutputs[stage-1-design]`
- `error.message` contains spawn error
- Workflow continues or stops (based on `stopOnError` setting)
- Retry attempted if `retryOnFailure > 0`

**Test Steps:**
1. Create workflow with mock spawner
2. Execute workflow
3. Verify error captured
4. Verify retry logic executed
5. Verify workflow continues/stops appropriately

**Evidence Required:**
- Stage output showing `status: "failed"`
- Error message in result
- Retry attempt logs

---

#### TC-2.1.2: Spawn Failure With Retry Logic
**Description:** Verify retry logic on spawn failures.

**Setup:**
- Mock spawner: Fails first 2 attempts, succeeds on 3rd
- `retryOnFailure: 3`

**Expected:**
- Failures logged for attempts 1 and 2
- Success on attempt 3
- `stage.attempts: 3`
- Stage completes successfully

**Evidence Required:**
- Log showing "Attempt 1/3 failed", "Attempt 2/3 failed", "Attempt 3/3 succeeded"
- Final stage status: `complete`

---

#### TC-2.1.3: Exhausted Retries (All Spawn Attempts Failed)
**Description:** Verify workflow stops after max retries exhausted.

**Setup:**
- Mock spawner: Always fails
- `retryOnFailure: 3`

**Expected:**
- 3 attempts logged
- Stage marked as failed
- Workflow continues or stops (based on `stopOnError`)

**Evidence Required:**
- Log showing 3 failed attempts
- `status: "failed"` in stage output

---

### 2.2 Timeout Handling

#### TC-2.2.1: Stage Timeout During Execution
**Description:** Detect and handle stage timeout.

**Setup:**
- Mock agent that runs for 10 minutes (longer than timeout)
- `stageTimeoutMinutes: 5`

**Expected:**
- Timeout detected during polling
- Stage marked as failed
- Error message: "Stage timeout after X minutes"

**Test Steps:**
1. Create workflow with long-running mock agent
2. Execute workflow
3. Wait for timeout to trigger
4. Verify stage failed
5. Verify workflow continues/stops

**Evidence Required:**
- Log showing timeout detected
- Stage status: `failed`
- Error: timeout message

---

#### TC-2.2.2: Timeout on Slow Agent (Response Delay)
**Description:** Handle timeout when agent stops responding mid-execution.

**Setup:**
- Mock agent: Responds twice (incomplete output), then stops responding
- `stageTimeoutMinutes: 3`

**Expected:**
- Inactivity detected (>300 seconds since last update)
- Stage marked as failed
- Error includes inactivity duration

**Evidence Required:**
- Log showing "Session inactive for X seconds"
- Stage status: `failed`

---

### 2.3 Transcript Parsing Failures

#### TC-2.3.1: Invalid JSON in Transcript
**Description:** Handle malformed JSON in agent output.

**Setup:**
- Mock agent returns: "completionEvidence: {invalid json here}"
- Stage attempts to parse evidence

**Expected:**
- Parse error caught
- Stage marked as failed
- Error message includes JSON parse error

**Evidence Required:**
- Log showing "Failed to parse completionEvidence"
- Stage status: `failed`

---

#### TC-2.3.2: Evidence File Not Found
**Description:** Handle missing evidence file referenced in transcript.

**Setup:**
- Agent transcript references: `{"filePath": "/nonexistent/file.txt"}`
- File does not exist

**Expected:**
- File access error caught
- Stage marked as failed
- Error: "Evidence file does not exist"

**Evidence Required:**
- Validation error in logs
- Stage status: `failed`

---

#### TC-2.3.3: Empty Evidence File (Validation)
**Description:** Detect and reject empty evidence files.

**Setup:**
- Agent creates empty evidence file (0 bytes)
- File path referenced in completionEvidence

**Expected:**
- Validation fails
- Error: "Evidence file is empty"
- Stage marked as failed

**Evidence Required:**
- Validation error list includes "is empty"
- Stage status: `failed`

---

#### TC-2.3.4: Fake Verification Markers
**Description:** Detect fake verification attempts in evidence files.

**Setup:**
- Evidence file contains: "I checked it mentally, looks good"
- File size < 200 bytes

**Expected:**
- Fake marker detected
- Validation fails
- Error: "Evidence contains fake verification marker"

**Evidence Required:**
- Validation error includes "fake verification marker"
- Stage status: `failed`

---

### 2.4 Git Commit Failures

#### TC-2.4.1: Git Repo Not Accessible
**Description:** Handle git operations failing (not a git repo, permission denied).

**Setup:**
- Working directory is not a git repository
- Stage completes with documentation changes

**Expected:**
- Git check catches error gracefully
- Warning logged: "Git check failed: [error message]"
- Stage status remains `complete` (git failure doesn't block completion)
- No git commit attempted

**Evidence Required:**
- Log showing `[git-check-warn]`
- Stage status: `complete` (git failure non-fatal)

---

#### TC-2.4.2: Git Add Fails
**Description:** Handle `git add` command failure.

**Setup:**
- Working directory is git repo but has permission issues
- Stage attempts git add

**Expected:**
- Error caught in try-catch
- Warning logged
- Stage continues (non-fatal)

**Evidence Required:**
- Warning log message
- Stage status: `complete`

---

#### TC-2.4.3: Commit Already Exists (No Changes)
**Description:** Handle case where no changes detected (git status returns empty).

**Setup:**
- Stage completes but no files changed
- Git status returns empty output

**Expected:**
- `git check` returns: `{committed: false, reason: 'No changes'}`
- No commit attempted
- Flow continues normally

**Evidence Required:**
- Log showing `[git-check] No changes detected`
- No git commit command executed

---

#### TC-2.4.4: Git Commit Conflict
**Description:** Handle git commit conflicts (e.g., merge conflict pending).

**Setup:**
- Git repo has uncommitted merge conflict
- Stage attempts commit

**Expected:**
- Commit command fails
- Error caught gracefully
- Warning logged
- Stage continues (non-fatal)

**Evidence Required:**
- Error caught in try-catch
- Warning log message

---

### 2.5 Abandoned Stage Detection

#### TC-2.5.1: Session Inactive >10 Minutes, No Output Files
**Description:** Detect abandoned stage (inactive session, no outputs).

**Setup:**
- Session last updated 20 minutes ago
- No output files created
- `detectAbandonedStage()` called

**Expected:**
- Abandonment detected: `true`
- Error logged: "Stage appears abandoned: session inactive, no output files"

**Evidence Required:**
- Log showing `[abandon-failed]`
- Stage marked as failed

---

#### TC-2.5.2: Session Inactive >10 Minutes, Has Output Files (Not Abandoned)
**Description:** Session inactive but has output files (work completed).

**Setup:**
- Session last updated 20 minutes ago
- Output files exist in output directory
- `detectAbandonedStage()` called

**Expected:**
- Abandonment detected: `false` (not abandoned - completed work exists)
- No error logged
- Workflow continues normally

**Evidence Required:**
- Log showing session checked but no abandonment
- Output files verified existence

---

#### TC-2.5.3: Session Recently Updated (<10 minutes)
**Description:** Active session should not be flagged as abandoned.

**Setup:**
- Session last updated 5 minutes ago
- `detectAbandonedStage()` called

**Expected:**
- Abandonment detected: `false`
- No warnings logged

**Evidence Required:**
- Log showing session checked
- No abandonment flagged

---

#### TC-2.5.4: Session Not Found (Cleaned Up)
**Description:** Handle case where session already cleaned up.

**Setup:**
- Session ID not found in active sessions
- `detectAbandonedStage()` called

**Expected:**
- Abandonment detected: `false` (session cleaned up, not abandoned)
- No error
- Workflow continues

**Evidence Required:**
- Safe handling (no exception thrown)
- Abandonment = false

---

## Test Area 3: Integration Testing

### Purpose
Validate end-to-end workflow execution with all 9 stages and 7 agents working together.

### Criticality: **HIGH**
Integration tests ensure the complete system works as designed.

---

### 3.1 Full Workflow End-to-End

#### TC-3.1.1: All 9 Stages Execute Successfully
**Description:** Verify full workflow executes all 9 stages in correct order.

**Setup:**
- Load production workflow: `test/workflow-full-9-stage.json`
- All 9 stages configured
- Valid dependencies between stages

**Expected:**
- All 9 stages execute in order (topological sort)
- `result.stages` has 9 entries
- All stage status: `complete`
- `result.success: true`
- Total execution time < 15 minutes

**Test Steps:**
1. Load full workflow JSON
2. Execute workflow
3. Verify all stages present in result
4. Verify execution order (dependencies respected)
5. Check all stages completed
6. Measure total duration

**Evidence Required:**
- Workflow result with all 9 stage outputs
- Execution order matches dependency graph
- All timestamps within 15-minute window
- Success flag: `true`

---

#### TC-3.1.2: Topological Sort Correctness
**Description:** Verify stages execute in dependency-satisfying order.

**Setup:**
- Workflow with complex dependencies:
  - Stage 1: No deps → executes first
  - Stage 2: Dep on Stage 1 → executes second
  - Stage 3: Dep on Stage 1, 2 → executes third
  - Stage 4: Dep on Stage 3 → executes fourth

**Expected:**
- Stages execute: 1 → 2 → 3 → 4 (dependency order)

**Evidence Required:**
- `result.executionOrder: [stage1, stage2, stage3, stage4]`
- Stage start times increase progressively

---

#### TC-3.1.3: Circular Dependency Detection
**Description:** Workflow should reject invalid circular dependencies.

**Setup:**
- Invalid workflow:
  - Stage 1: Dep on Stage 2
  - Stage 2: Dep on Stage 1

**Expected:**
- Validation fails
- Error: "Circular dependency detected"
- Workflow not executed

**Evidence Required:**
- `validateWorkflow()` returns `valid: false`
- Error includes stage names involved

---

#### TC-3.1.4: Dependency on Non-Existent Stage
**Description:** Detect invalid dependencies.

**Setup:**
- Stage 1 depends on "nonexistent-stage"

**Expected:**
- Validation fails
- Error: "Stage depends on unknown stage: nonexistent-stage"

**Evidence Required:**
- Validation error list includes dependency error

---

### 3.2 Multi-Agent Coordination

#### TC-3.2.1: All 7 Agents Spawn and Execute
**Description:** Verify all 7 different agent types spawn correctly.

**Setup:**
- Workflow uses 7 different agents (agentId values):
  - agent-prd, agent-design, agent-api, agent-testing
  - agent-gap-analysis, agent-security, agent-ux

**Expected:**
- All 7 agents spawn successfully
- Each agent executes its assigned stage
- All agents complete

**Evidence Required:**
- Log shows spawn commands for all 7 agents
- All 7 stages have `status: "complete"`

---

#### TC-3.2.2: Context Passing Between Agents
**Description:** Verify context/output from earlier stages passed to later stages.

**Setup:**
- Stage 1 output contains: `{"result": "stage1-data"}`
- Stage 2 task includes: `{context.stage1Output}`

**Expected:**
- Stage 2 transcript includes stage1 output data
- Context injection worked correctly

**Evidence Required:**
- Stage 2 transcript contains "stage1-data"
- Context variable resolved

---

#### TC-3.2.3: Parallel Stage Execution (When Dependencies Allow)
**Description:** Verify stages with no mutual dependencies can execute in parallel.

**Setup:**
- Workflow:
  - Stage 1, Stage 2: Both depend on nothing
  - Stage 3: Depends on Stage 1
  - Stage 4: Depends on Stage 2

**Expected:**
- Stage 1 and Stage 2 execute concurrently (or close in time)
- Stage 3 waits for Stage 1
- Stage 4 waits for Stage 2

**Evidence Required:**
- Start timestamps for Stage 1 and Stage 2 within 10 seconds
- Stage 3 start time > Stage 1 end time

---

**NOTE:** Current implementation is sequential (one agent at a time). This test documents expected parallel behavior for future enhancement.

---

### 3.3 Git Commit Integration

#### TC-3.3.1: Documentation Stages Trigger Commits
**Description:** Verify .md file changes trigger automatic git commits.

**Setup:**
- Stage modifies: `PRD.md`, `API.md`, `DESIGN.md`
- Stage is documentation stage

**Expected:**
- Git check detects .md file changes
- `git add -A` executed
- `git commit` executed with message
- Commit author: `"Vincent [Agent: sequential-queue] <vincent-agent@aomni.com>"`

**Evidence Required:**
- Git status shows changes committed
- Commit message includes stage name
- Commit author is agent (not Kelly)

---

#### TC-3.3.2: Non-Documentation Changes Staged But Not Committed
**Description:** Verify code changes are staged but not auto-committed.

**Setup:**
- Stage modifies: `.js` files (not .md)
- Git check runs

**Expected:**
- Git check detects changes
- Changes staged (`git add -A`)
- No commit executed
- Message: "Non-documentation changes staged"

**Evidence Required:**
- Git status shows staged changes
- No new commit in git log

---

#### TC-3.3.3: Commit Message Format Verification
**Description:** Verify commit messages follow required format.

**Setup:**
- Stage "prd-redraft" completes with .md changes
- Git commit executed

**Expected:**
- Commit message format:
  ```
  [prd-redraft] Complete stage prd-redraft

  Stage completed by Sequential Agent Queue

  References: fix-log-enhancement.md

  Author: Vincent [Agent: sequential-queue] <vincent-agent@aomni.com>
  ```

**Evidence Required:**
- `git log -1 --format=full` shows correct format
- Author is agent identity

---

### 3.4 Transcript Capture

#### TC-3.4.1: All Stage Transcripts Saved
**Description:** Verify transcripts captured for all stages.

**Setup:**
- Execute full 9-stage workflow

**Expected:**
- All 9 stages have `transcript` in output
- Transcripts saved to files (or in-memory)
- Transcripts contain agent responses

**Evidence Required:**
- All stage outputs have `transcript` field
- Transcript content is non-empty
- Transcripts are readable text

---

#### TC-3.4.2: Evidence Files Created for All Stages
**Description:** Verify evidence JSON created for all stages.

**Setup:**
- All stages configured with `completionEvidence` output

**Expected:**
- All 9 stages have `evidence.filePath` in output
- All evidence files exist and are valid JSON
- Evidence contains required fields

**Evidence Required:**
- Verify 9 evidence files exist
- All files parse as valid JSON
- Each evidence has: `evidenceType`, `filePath`, `verifiedBy`, `timestamp`

---

### 3.5 Governance Protocols

#### TC-3.5.1: Governance Text Embedded in All Agent Tasks
**Description:** Verify VERIFICATION_PROTOCOL and governance protocols embedded.

**Setup:**
- Execute workflow
- Capture agent spawn commands

**Expected:**
- All agent tasks include "MANDATORY GOVERNANCE"
- All agent tasks include VERIFICATION_PROTOCOL reference
- All agent tasks include fix log requirement

**Evidence Required:**
- Log shows governance text appended to tasks
- Agent transcripts show governance information received

---

#### TC-3.5.2: Checkpoint Integration
**Description:** Verify checkpoints reported for workflow lifecycle.

**Setup:**
- Enable checkpoint library
- Execute workflow

**Expected:**
- Checkpoint for workflow start
- Checkpoint for each stage completion
- Checkpoint for workflow complete (or failed)

**Evidence Required:**
- Checkpoint logs show all lifecycle events
- All checkpoints have correct status and labels

---

## Test Prioritization Matrix

### Priority Levels

| Priority | Definition | Rationale |
|----------|------------|-----------|
| **P0 - Critical** | Core feature or critical failure path | Must work for system to function |
| **P1 - High** | Important feature or common error scenario | Should work for production readiness |
| **P2 - Medium** | Edge case or uncommon scenario | Nice to have for robustness |
| **P3 - Low** | Rare scenario or future enhancement | Can defer if time constrained |

### Prioritized Test Cases

| Test Case | Priority | Area | Automation Ready? |
|-----------|----------|------|-------------------|
| **Iteration Loop Tests** | | | |
| TC-1.1.1: Normal flow (no iteration) | P0 | Loop | ✅ Yes |
| TC-1.1.2: Single iteration | P0 | Loop | ✅ Yes |
| TC-1.1.3: Max iterations reached | P0 | Loop | ✅ Yes |
| TC-1.2.1: Counter increments | P1 | Loop | ✅ Yes |
| TC-1.3.1: Iteration disabled | P1 | Loop | ✅ Yes |
| TC-1.4.2: Multiple critical gaps | P1 | Loop | ✅ Yes |
| TC-1.4.3: Gap in non-final stage | P2 | Loop | ⚠️ Partial |
| TC-1.5.1: Evidence JSON parsing | P0 | Loop | ✅ Yes |
| TC-1.5.2: Transcript fallback | P1 | Loop | ✅ Yes |
| TC-1.5.3: Priority filtering | P1 | Loop | ✅ Yes |
| **Error Handling Tests** | | | |
| TC-2.1.1: Spawn failure | P0 | Error | ✅ Yes |
| TC-2.1.2: Spawn with retry | P0 | Error | ✅ Yes |
| TC-2.2.1: Stage timeout | P0 | Error | ⚠️ Slow test |
| TC-2.3.1: Invalid JSON in transcript | P1 | Error | ✅ Yes |
| TC-2.3.2: Evidence file not found | P1 | Error | ✅ Yes |
| TC-2.3.3: Empty evidence file | P1 | Error | ✅ Yes |
| TC-2.3.4: Fake verification markers | P1 | Error | ✅ Yes |
| TC-2.4.1: Git repo not accessible | P2 | Error | ✅ Yes |
| TC-2.5.1: Abandoned stage detected | P1 | Error | ⚠️ Slow test |
| TC-2.5.2: Session inactive, has outputs | P2 | Error | ⚠️ Slow test |
| **Integration Tests** | | | |
| TC-3.1.1: All 9 stages execute | P0 | Integration | ✅ Yes |
| TC-3.1.2: Topological sort | P0 | Integration | ✅ Yes |
| TC-3.1.4: Dependency on non-existent stage | P1 | Integration | ✅ Yes |
| TC-3.2.1: All 7 agents spawn | P0 | Integration | ✅ Yes |
| TC-3.2.2: Context passing | P1 | Integration | ✅ Yes |
| TC-3.3.1: Documentation stages trigger commits | P1 | Integration | ✅ Yes |
| TC-3.3.2: Non-doc changes staged not committed | P2 | Integration | ✅ Yes |
| TC-3.3.3: Commit message format | P1 | Integration | ✅ Yes |
| TC-3.4.1: All transcripts saved | P2 | Integration | ✅ Yes |
| TC-3.4.2: All evidence files created | P2 | Integration | ✅ Yes |
| TC-3.5.1: Governance embedded | P1 | Integration | ✅ Yes |

**Total Test Cases:** 32
- **P0 Critical:** 11
- **P1 High:** 14
- **P2 Medium:** 7
- **P3 Low:** 0

---

## Automation Approach

### Automated Tests (Unit Tests)
**Tool:** Node.js test framework (Jest or Mocha)
**Location:** `testing/unit/`

**Automatable Test Cases:**
- ✅ TC-1.1.1 through TC-1.1.3 (iteration loop logic)
- ✅ TC-1.2.1 (counter increments)
- ✅ TC-1.3.1 (iteration disable)
- ✅ TC-1.4.2 (multiple gaps)
- ✅ TC-1.5.1 through TC-1.5.4 (gap detection logic)
- ✅ TC-2.3.1 through TC-2.3.4 (transcript validation)
- ✅ TC-2.4.1 through TC-2.4.4 (git operations - mock git)
- ✅ TC-3.1.2 through TC-3.1.4 (validation logic)
- ✅ TC-3.2.2 (context passing logic)

**Implementation Pattern:**
```javascript
describe('Iteration Loop - Critical Gap Detection', () => {
  test('TC-1.5.1: Evidence JSON parsing (preferred method)', async () => {
    const stageOutput = {
      transcript: 'Analysis complete',
      evidence: {
        filePath: '/tmp/evidence.json'
      }
    };

    // Mock evidence file
    fs.writeFileSync('/tmp/evidence.json', JSON.stringify({
      gaps: [
        {priority: 'HIGH', status: 'open'},
        {priority: 'LOW', status: 'open'}
      ]
    }));

    // Call checkCriticalGaps
    const result = checkCriticalGaps(stageOutput);

    // Verify: 1 critical gap detected
    expect(result.hasCriticalGaps).toBe(true);
    expect(result.count).toBe(1);
  });
});
```

---

### Integration Tests (Requires Real Agents)
**Tool:** Node.js + OpenClaw agent CLI
**Location:** `testing/integration/`

**Semi-Automatable Test Cases:**
- ⚠️ TC-1.1.1 through TC-1.1.3 (need real workflows executed)
- ⚠️ TC-2.1.1 through TC-2.1.3 (need mock spawner)
- ⚠️ TC-3.1.1 (all 9 stages)
- ⚠️ TC-3.2.1 (all 7 agents)
- ⚠️ TC-3.3.1 through TC-3.3.3 (git integration)
- ⚠️ TC-3.4.1 through TC-3.4.2 (transcripts/evidence)

**Implementation Pattern:**
```javascript
// test/integration/iteration-basic.js
const { executeWorkflow } = require('../../queue.js');

test('TC-1.1.1: Normal flow (no iteration)', async () => {
  const workflow = require('../workflows/no-gaps.json');
  const result = await executeWorkflow(workflow);

  expect(result.success).toBe(true);
  expect(result.iteration.status).toBe('no-gaps');
  expect(result.iteration.current).toBe(0);

  // Write results to test log
  await fs.appendFile('testing/integration/test-log.md', JSON.stringify(result, null, 2));
}, 300000); // 5-minute timeout
```

---

### Manual Tests (Human Verification Required)
**Test Cases Requiring Manual Review:**
- 📋 TC-2.2.1 (timeout behavior - need real agent)
- 📋 TC-2.5.1, TC-2.5.2 (abandoned stage detection - need time)
- 📋 TC-3.3.1 through TC-3.3.3 (git commits - verify git log)
- 📋 TC-3.5.1 (governance protocols - visually verify transcripts)

**Manual Test Checklist Template:**
```markdown
## Manual Test: TC-2.5.1 - Abandoned Stage Detection

**Date:** 2026-02-16
**Tester:** Vincent

**Setup:**
[ ] Create workflow with stage that will timeout
[ ] Execute workflow

**Execution:**
[ ] Wait for session to be inactive >10 minutes
[ ] Check abandonment detection logs

**Verification:**
[ ] Log shows: [abandon-failed] Stage appears abandoned
[ ] Status: failed

**Evidence:**
[ ] Screenshot of log output
[ ] Status result from workflow

**Result:** PASS / FAIL
```

---

### Performance Tests
**Tool:** Node.js + custom timing
**Location:** `testing/performance/`

**Test Cases:**
- 📊 Full 9-stage workflow execution time (<15 minutes)
- 📊 Single stage execution time (<3 minutes each)
- 📊 Iteration overhead (time penalty for restart)
- 📊 Memory usage (no leaks across iterations)

---

## Test Execution Plan

### Phase 1: Unit Tests (Automated)
**Timeline:** After CODER implementation complete
**Duration:** 1-2 hours
**Tests:** All P0 unit tests (logic validation)

**Deliverable:**
- `testing/unit/test-results.md`
- All P0 tests passing

---

### Phase 2: Integration Tests (Semi-Automated)
**Timeline:** After unit tests pass
**Duration:** 4-6 hours
**Tests:** All P0 + P1 integration tests

**Deliverable:**
- `testing/integration/test-results.md`
- Screenshots/Logs for each test
- Test workflows saved in `testing/workflows/`

---

### Phase 3: Manual Tests (Human Verification)
**Timeline:** After integration tests pass
**Duration:** 2-4 hours
**Tests:** Timeout, abandonment, git verification

**Deliverable:**
- `testing/manual/test-results.md`
- Evidence (screenshots, git logs)
- Pass/fail for each manual test

---

### Phase 4: Performance Tests (Optional)
**Timeline:** After all functional tests pass
**Duration:** 1 hour
**Tests:** Execution times, memory leaks

**Deliverable:**
- `testing/performance/test-results.md`
- Performance metrics

---

## Test Data Requirements

### Test Workflows Required

| Workflow File | Purpose | Test Cases |
|---------------|---------|------------|
| `no-gaps.json` | Normal flow, no iteration | TC-1.1.1 |
| `single-iteration.json` | One restart | TC-1.1.2 |
| `max-iterations.json` | 3 iterations, persistent gaps | TC-1.1.3 |
| `iteration-disabled.json` | Disabled iteration | TC-1.3.1 |
| `multiple-gaps.json` | Multiple critical gaps | TC-1.4.2 |
| `full-9-stage.json` | Full workflow | TC-3.1.1 |
| `circular-dep.json` | Invalid workflow | TC-3.1.3 |
| `invalid-dep.json` | Bad dependency | TC-3.1.4 |

---

### Mock Data Required

| File | Purpose | Content |
|------|---------|---------|
| `evidence-with-gaps.json` | Critical gap test | Gaps array with HIGH priority |
| `evidence-resolved.json` | Resolved gap test | Gaps with status "resolved" |
| `empty-evidence.txt` | Empty file test | 0 bytes |
| `fake-evidence.txt` | Fake marker test | "Checked mentally, looks good" |
| `transcript-with-gap.txt` | Transcript fallback | "Gap with high priority detected" |

---

## Success Criteria

### Release Readiness

**Must Have (P0):**
- ✅ All 11 P0 tests passing
- ✅ No critical bugs
- ✅ Documentation complete

**Should Have (P1):**
- ✅ All 14 P1 tests passing
- ✅ Error handling verified
- ✅ Integration tests confirmed

**Nice to Have (P2):**
- ✅ Majority of P2 tests passing
- ✅ Performance metrics within spec
- ✅ Edge cases documented

---

## Blocking Issues

### Current Blockers

1. **ARCHIE Architecture Review** - Pending
   - Status: Awaiting completion
   - Impact: Cannot execute integration tests
   - Resolution: ARCHIE review complete → Proceed

2. **CODER Implementation** - Pending
   - Status: Awaiting completion
   - Impact: Cannot execute tests
   - Resolution: CODER implementation complete → Proceed

---

## Appendix: Test Case Details

### Detailed Test Procedures

See individual test case sections above for:
- Setup steps
- Execution steps
- Expected results
- Evidence requirements

---

### Test Artifacts

**Log Locations:**
- Unit test logs: `testing/unit/test-results.md`
- Integration test logs: `testing/integration/test-results.md`
- Manual test logs: `testing/manual/test-results.md`
- Performance logs: `testing/performance/test-results.md`

**Workflow Locations:**
- Test workflows: `testing/workflows/*.json`
- Mock data: `testing/mock-data/*`

---

## Conclusion

This test plan provides comprehensive coverage for Sequential Queue enhancements:

- **32 total test cases**
- **11 P0 critical tests** (core functionality)
- **14 P1 high-priority tests** (common scenarios)
- **7 P2 medium-priority tests** (edge cases)
- **Automated + semi-automated + manual** approach

**Next Steps:**
1. ⏸️ **Wait:** ARCHIE architecture review complete
2. ⏸️ **Wait:** CODER implementation complete
3. ▶️ **Execute:** Phase 1 - Unit tests
4. ▶️ **Execute:** Phase 2 - Integration tests
5. ▶️ **Execute:** Phase 3 - Manual tests
6. ▶️ **Execute:** Phase 4 - Performance tests
7. ✅ **Report:** Final verification with evidence

**VERIFICATION_REQUIRED:** All tests logged with evidence, defects cataloged, pass/fail status documented.

---

**Author:** QA (Expert)
**Date:** 2026-02-16
**Version:** 1.0
**Status:** Design complete, awaiting implementation for execution