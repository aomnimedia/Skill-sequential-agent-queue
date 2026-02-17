# Sequential Queue Iteration Feature

**Added:** 2026-02-16
**Purpose:** Automatic workflow iteration when critical gaps detected

## Overview

The Sequential Agent Queue now supports automatic iteration loops. After workflow completion, the system checks for critical gaps in the final stage output (typically GAP-ANALYSIS). If critical gaps are detected and the iteration limit hasn't been reached, the workflow automatically restarts from Stage 0.

## Configuration

### Workflow JSON Configuration

```json
{
  "name": "example-documentation-redraft",
  "iterationEnabled": true,
  "maxIterations": 3,
  "stages": [...]
}
```

### Configuration Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `iterationEnabled` | boolean | `true` | Enable iteration loop (set to `false` to disable) |
| `maxIterations` | number | `3` | Maximum number of iterations before stopping |

## Critical Gap Detection

The system automatically checks the final stage output for critical gaps:

### Detection Criteria

A gap is considered **critical** if:
1. **Priority:** HIGH criticality level
2. **Status:** NOT resolved/deferred/mitigated/accepted-risk

### Detection Methods

1. **Evidence JSON (preferred):**
   - Parses `evidence.gaps` array from last stage
   - Checks gap.priority === 'HIGH'
   - Excludes resolved/deferred/mitigated/accepted-risk gaps

2. **Transcript fallback:**
   - Searches transcript for gap mentions with "high priority"
   - Pattern: `/gap\s+high|high\s+gap|critical\s+gap|priority:\s*high/gi`

## Iteration Behavior

### Normal Flow (No Iteration)

```
PRD → DESIGN → API → TESTING → GAP-ANALYSIS
     ↓
Workflow completes
```

### Iteration Flow (Critical Gaps Detected)

```
Iteration 1: PRD → DESIGN → API → TESTING → GAP-ANALYSIS
                           ↓
                    Critical gaps detected
                           ↓
Iteration 2: PRD → DESIGN → API → TESTING → GAP-ANALYSIS
                           ↓
                    No critical gaps
                           ↓
                    Workflow completes
```

### Max Iterations Reached

```
Iteration 1: PRD → ... → GAP-ANALYSIS (critical gaps)
Iteration 2: PRD → ... → GAP-ANALYSIS (critical gaps)
Iteration 3: PRD → ... → GAP-ANALYSIS (critical gaps)
                           ↓
                    Max iterations (3) reached
                           ↓
                    Workflow stops (may have unresolved gaps)
```

## Iteration Status

The workflow return value includes iteration information:

```json
{
  "success": true,
  "workflow": "example-redraft",
  "stages": {...},
  "iteration": {
    "current": 2,
    "max": 3,
    "enabled": true,
    "status": "no-gaps",
    "previousIterations": [
      {
        "iteration": 0,
        "stageOutputs": {...},
        "gaps": [...]
      },
      {
        "iteration": 1,
        "stageOutputs": {...},
        "gaps": [...]
      }
    ]
  }
}
```

### Iteration Status Values

| Status | Meaning |
|--------|---------|
| `"not-enabled"` | Iteration disabled, workflow ran normally |
| `"no-gaps"` | Workflow completed, no critical gaps detected |
| `"restart-detected"` | Critical gaps detected, workflow is restarting |
| `"reached-max"` | Max iterations reached, workflow stopped |

## Context Preservation

When restarting, the workflow preserves previous iteration data:

```javascript
{
  iteration: 0, // Current iteration number
  maxIterations: 3, // Maximum allowed
  previousIterations: [ // Array of past iterations
    {
      iteration: 0,
      stageOutputs: {...}, // Stage outputs from iteration 0
      gaps: [...] // Gaps that caused restart
    }
  ]
}
```

Use this to track progress across iterations.

## Logging

Iteration status is logged at each checkpoint:

```
[iteration-config] Iteration: 0/3, Enabled: true
[iteration-0] Critical gaps detected (5 gaps)
[iteration-0] Restarting workflow from stage 0...
[iteration-result] Status: restart-detected, Iteration: 0/3

[iteration-1] No critical gaps, workflow complete
[iteration-result] Status: no-gaps, Iteration: 1/3
```

## Best Practices

### 1. Set Appropriate Max Iterations

- **Documentation redraft:** 3-4 iterations (common)
- **Feature development:** 2-3 iterations
- **Bug fixes:** 1-2 iterations

### 2. Document Gap Resolution

When iterating:
- Document how gaps were addressed
- Update evidence with new resolutions
- Track which gaps persist vs. resolved

### 3. Use Iteration History

Leverage `iteration.previousIterations` to:
- Compare decisions across iterations
- Track learning from past cycles
- Identify patterns in recurring gaps

### 4. Disable Iteration for One-Off Tasks

For workflows that shouldn't iterate:
```json
{
  "iterationEnabled": false,
  "stages": [...]
}
```

### 5. Handle Max Iterations Gracefully

If max iterations reached with unresolved gaps:
- Review why gaps weren't addressed
- Adjust approach or workflow design
- May need human intervention

## Example Workflow

### Gap-Informed Documentation Redraft

```json
{
  "name": "gap-informed-redraft",
  "iterationEnabled": true,
  "maxIterations": 4,
  "workingDirectory": "/home/optimistprime/.openclaw/workspace",
  "stages": [
    {
      "name": "prd-redraft",
      "description": "Redraft PRD based on gap analysis",
      "dependencies": []
    },
    {
      "name": "gap-analysis",
      "description": "Analyze gaps, identify critical items",
      "dependencies": ["prd-redraft", "design-redraft", "api-redraft", "testing-redraft"]
    }
  ]
}
```

## Implementation Details

### Functions Added/Modified

1. **`checkCriticalGaps(stageOutput)`**
   - Parses stage output for critical gaps
   - Returns object with gap count and status
   - Supports evidence JSON and transcript parsing

2. **`executeWorkflow()`**
   - Added iteration configuration
   - Checks for critical gaps after last stage
   - Restarts workflow if conditions met
   - Returns iteration status in result

### Restart Conditions

Workflow restarts if ALL of these are true:
1. `workflow.iterationEnabled === true`
2. All stages completed successfully (`success = true`)
3. `currentIteration < maxIterations`
4. `checkCriticalGaps(lastStageOutput).hasCriticalGaps === true`

### Stopping Conditions

Workflow stops if ANY of these are true:
1. `workflow.iterationEnabled === false`
2. Any stage failed
3. `currentIteration >= maxIterations`
4. No critical gaps detected

---

**Author:** Vincent [Agent: sequential-queue-iteration]
**Date:** 2026-02-16
**Version:** 1.0
