# Sequential Agent Queue

Automated sequential execution of multi-stage agent workflows with dependency passing and progress tracking.

**Architecture Updates:**
- **v2.0 (2026-02-16):** Production-ready enhancements with evidence validation, git commit enforcement (Fixes #1-#6)
- **v1.0 (2026-02-16):** Removed Antfarm dependency, uses OpenClaw `agent` CLI directly, embeds governance protocols

## What This Skill Does

The **Sequential Agent Queue** skill enables you to define complex, multi-stage workflows where each stage depends on outputs from previous stages. It automatically:

- **Parses dependency graphs** and executes stages in the correct order (topological sort)
- **Passes context** between stages based on configurable callbacks
- **Tracks progress** with status reporting and time tracking
- **Handles failures** with configurable retries and error recovery
- **Integrates with checkpoints** for resume capability after interruptions
- **Enforces governance** by embedding mandatory protocols in all tasks

## Architecture

### How It Works (Post-Antfarm)

1. **Stage Execution**: Each stage spawns an agent using `openclaw agent` CLI
2. **Session Polling**: Polls `openclaw sessions` every 5 seconds to check completion
3. **Completion Detection**: Considers a session complete when:
   - Session is inactive for >5 minutes (no updates)
   - Session has status 'complete' or 'error'
   - Session is not found (may have been cleaned up)
4. **Governance Injection**: Automatically appends governance protocols to all tasks:
   ```
   MANDATORY GOVERNANCE:
   - Follow VERIFICATION_PROTOCOL.md
   - Create fix log before making changes
   - Use checkpoint.js for progress tracking
   - Complete with VERIFICATION_REQUIRED evidence
   ```

### Key Differences from Antfarm Version

| Feature | Antfarm Version | New Version |
|---------|-----------------|-------------|
| Agent Spawning | `antfarm workflow run` | `openclaw agent` CLI |
| Completion Detection | Antfarm manages internally | Polls `openclaw sessions` |
| Governance | ❌ Bypassed | ✅ Embedded in all tasks |
| Timeout Enforcement | Antfarm | Built-in with polling |
| Session Tracking | Antfarm internal | Direct OpenClaw sessions |

## When to Use This Skill

Use Sequential Agent Queue when you have workflows like:

- **Documentation pipelines**: PRD → Design Docs → API Specs → Testing Plans
- **Development workflows**: Requirements → Architecture → Code → Tests → Deployment
- **Data processing**: Extract → Transform → Load → Validate
- **CI/CD pipelines**: Build → Test → Security Scan → Deploy
- **Any multi-stage process** where stages depend on previous outputs

### When NOT to Use

- **Simple or quick tasks** - Better handled directly with `openclaw agent`
- **Parallel workflows** - This skill executes sequentially only
- **Complex feature development pipelines** - Consider specialized agents or Antfarm for those
- **One-off tasks** - Without clear dependencies

## Quick Start

### Simple Workflow Example

```javascript
const { executeWorkflow } = require('skills/sequential-agent-queue/queue.js');

// Define a simple 3-stage workflow
const workflow = {
    name: 'project-documentation',
    stages: [
        {
            name: 'prd',
            task: 'Create PRD.md for the new governance system. Include user stories, requirements, and success metrics.',
            dependencies: []
        },
        {
            name: 'design',
            task: 'With PRD context, create DESIGN.md for the governance system. Focus on architecture, data models, and component design.',
            dependencies: ['prd'],
            contextFrom: (outputs) => ({ prd: outputs.prd.file })
        },
        {
            name: 'api',
            task: 'With DESIGN context, create API.md documenting all endpoints, schemas, and integration points.',
            dependencies: ['design'],
            contextFrom: (outputs) => ({ design: outputs.design.file })
        }
    ],
    stopOnError: true,
    agentId: 'documentation-agent',
    retryOnFailure: 1
};

// Execute the workflow
const result = await executeWorkflow(workflow);
console.log('Workflow complete:', result);
```

### Complex Workflow with Branching

```javascript
const workflow = {
    name: 'full-development-pipeline',
    stages: [
        {
            name: 'requirements',
            task: 'Gather and document requirements. Create PROJECT-REQUIREMENTS.md',
            dependencies: []
        },
        {
            name: 'architecture',
            task: 'Create architecture design. Reference requirements. Output ARCHITECTURE.md',
            dependencies: ['requirements'],
            contextFrom: (outputs) => ({ requirements: outputs.requirements.file })
        },
        {
            name: 'frontend-design',
            task: 'Design frontend components and UI flows. Reference architecture. Output FRONTEND-DESIGN.md',
            dependencies: ['architecture'],
            contextFrom: (outputs) => ({ architecture: outputs.architecture.file })
        },
        {
            name: 'backend-design',
            task: 'Design backend services and APIs. Reference architecture. Output BACKEND-DESIGN.md',
            dependencies: ['architecture'],
            contextFrom: (outputs) => ({ architecture: outputs.architecture.file })
        },
        {
            name: 'api-specs',
            task: 'Create comprehensive API specifications. Reference backend design. Output API-SPECS.md',
            dependencies: ['backend-design'],
            contextFrom: (outputs) => ({ backendDesign: outputs['backend-design'].file })
        },
        {
            name: 'frontend-code',
            task: 'Implement frontend components following design. Reference frontend design.',
            dependencies: ['frontend-design'],
            contextFrom: (outputs) => ({ frontendDesign: outputs['frontend-design'].file })
        },
        {
            name: 'backend-code',
            task: 'Implement backend services. Reference API specs.',
            dependencies: ['api-specs'],
            contextFrom: (outputs) => ({ apiSpecs: outputs['api-specs'].file })
        },
        {
            name: 'integration-testing',
            task: 'Run integration tests. Requires both frontend and backend code.',
            dependencies: ['frontend-code', 'backend-code'],
            contextFrom: (outputs) => ({
                frontend: outputs['frontend-code'].file,
                backend: outputs['backend-code'].file
            })
        }
    ],
    stopOnError: true,
    agentId: 'dev-team',
    retryOnFailure: 2,
    stageTimeoutMinutes: 30
};
```

## Workflow Definition Reference

A workflow is an object with the following structure:

```javascript
{
    // Required: Workflow name (for tracking)
    name: 'my-workflow',

    // Required: Array of stage definitions
    stages: [
        // Stage object (see Stage Definition below)
    ],

    // Optional: Stop workflow if any stage fails (default: true)
    stopOnError: true,

    // Optional: Number of retries per stage (default: 0)
    retryOnFailure: 0,

    // Optional: Timeout per stage in minutes (default: 15)
    stageTimeoutMinutes: 15,

    // Optional: Agent ID for stages (default: uses default agent)
    agentId: 'default',

    // Optional: Working directory for stage outputs (default: cwd)
    workingDirectory: '/path/to/workspace',

    // Optional: Custom checkpoint integration function
    checkpointIntegration: (label, description, status, details) => { /* ... */ }
}
```

### Stage Definition

Each stage in the `stages` array must have:

```javascript
{
    // Required: Unique stage identifier (used in dependencies)
    name: 'stage-name',

    // Required: Task description passed to the agent
    task: 'Task description with context...',

    // Required: List of stage names this stage depends on
    dependencies: ['previous-stage'],

    // Optional: Callback to build context from previous stage outputs
    contextFrom: (outputs) => ({
        // Context object to inject into task
        previousFile: outputs['previous-stage'].file
    }),

    // Optional: Agent ID override (uses workflow default if omitted)
    agentId: 'specialist-agent',

    // Optional: Timeout override in minutes (uses workflow default if omitted)
    timeoutMinutes: 10,

    // Optional: Retry override (uses workflow default if omitted)
    retries: 1
}
```

### Context Passing with `contextFrom`

The `contextFrom` callback receives all completed stage outputs and returns a context object:

```javascript
contextFrom: (outputs) => ({
    // outputs contains all completed stages keyed by stage name
    // Each output has: { output: string, file: string, startTime, endTime, duration }
    prd: outputs.prd.file,
    designSummary: outputs.design.output.substring(0, 500),
    
    // You can derive custom context
    projectFiles: Object.values(outputs).map(o => o.file)
})
```

The context is then available to the agent when executing the task. Context is typically referenced in the task string:

```javascript
{
    name: 'design',
    task: 'Create DESIGN.md. Reference the PRD at {prd} for requirements.',
    dependencies: ['prd'],
    contextFrom: (outputs) => ({ prd: outputs.prd.file })
}
```

## API Reference

### `executeWorkflow(workflow, context?)`

Executes a complete workflow with all stages in dependency order.

**Parameters:**
- `workflow` (object) - Workflow definition
- `context` (object, optional) - Additional context to inject into all stages

**Returns:**
- Promise resolving to:
  ```javascript
  {
      success: true,
      workflow: 'workflow-name',
      stages: {
          'stage-name': {
              status: 'complete' | 'failed' | 'skipped',
              output: 'Agent response',
              file: '/path/to/output/file',
              startTime: ISO-8601 timestamp,
              endTime: ISO-8601 timestamp,
              duration: milliseconds,
              attempts: 1,
              sessionId: 'session-id-or-null'
          }
      },
      totalDuration: milliseconds,
      failedStage: 'stage-name' (if failed),
      executionOrder: ['stage1', 'stage2', 'stage3']
  }
  ```

### `validateWorkflow(workflow)`

Validates workflow definition before execution.

**Parameters:**
- `workflow` (object) - Workflow definition

**Returns:**
- Object with `valid` (boolean) and `errors` (array) fields

### `getWorkflowStatus(workflowName)`

Gets current status of an in-progress workflow.

**Parameters:**
- `workflowName` (string) - Workflow name

**Returns:**
- Current status object or null if not found

### `cancelWorkflow(workflowName)`

Cancels an in-progress workflow.

**Parameters:**
- `workflowName` (string) - Workflow name

**Returns:**
- Promise resolving to boolean indicating success

## Integration with Checkpoint.js

Sequential Agent Queue integrates with the checkpoint system for progress tracking and resume capability.

### Automatic Checkpoint Points

The skill automatically creates checkpoints at key points:

1. **Workflow Started**: When execution begins
2. **Stage Started**: When each stage begins
3. **Stage Complete**: After successful stage completion (with outputs)
4. **Stage Failed**: After stage failure (retry or stop)
5. **Workflow Complete**: After all stages complete successfully
6. **Workflow Failed**: After workflow failure

### Checkpoint Structure

Each checkpoint includes:

```javascript
{
    label: 'stage_complete',
    description: 'Stage "prd" completed successfully',
    status: 'active',
    details: {
        workflow: 'workflow-name',
        stage: 'prd',
        output: '/path/to/output',
        duration: 45000,
        sessionId: 'session-id'
    }
}
```

## Error Handling and Retries

### Retry Behavior

Each stage can be configured with retries:

```javascript
{
    name: 'api-docs',
    task: 'Create API documentation...',
    dependencies: ['design'],
    retries: 2  // Retry up to 2 times on failure
}
```

Retry logic:

1. **First attempt**: Execute stage
2. **On failure**: Log error, increment attempt counter
3. **If attempts < retries**: Wait 5 seconds × attempt number, retry with same task
4. **If attempts >= retries**: Mark stage as failed

### Stop on Error

By default, workflows stop on the first failure:

```javascript
const workflow = {
    stopOnError: true,  // Default
    // ... config
};
```

Set to `false` to continue executing independent stages after a failure:

```javascript
const workflow = {
    stopOnError: false,  // Continue even if stages fail
    // ... config
};
```

**Note:** Stages with unmet dependencies won't run if their dependencies fail.

### Timeout Handling

Configure timeouts per workflow or per stage:

```javascript
const workflow = {
    stageTimeoutMinutes: 15,  // Global default
    
    stages: [
        {
            name: 'long-task',
            task: '...',
            timeoutMinutes: 30  // Override for this stage
        }
    ]
};
```

On timeout:
- Stage is marked as failed
- Agent is killed after timeout period
- Next stage depends on retry configuration
- Workflow stops if `stopOnError: true`

### Error Reporting

Failed stages include error details:

```javascript
{
    stage: 'docs',
    status: 'failed',
    error: {
        message: 'Agent timeout exceeded',
        attempts: 1,
        lastError: 'Agent did not respond within timeout'
    }
}
```

## Progress Tracking

### Real-time Progress

Monitor workflow progress through:

```javascript
const result = await executeWorkflow(workflow);

// Check individual stage status
for (const [stageName, stageInfo] of Object.entries(result.stages)) {
    console.log(`${stageName}: ${stageInfo.status} (${stageInfo.duration}ms)`);
}
```

### Console Output

The skill outputs progress to console:

```
[workflow-started] Starting workflow: project-documentation
[workflow-order] Execution order: prd → design → api
[stage-started] Executing stage: prd (attempt 1/1)
[queue] Spawning agent: documentation-agent
[queue] Agent spawned with session: abc123
[queue] Waiting for session abc123 to complete (timeout: 900s)...
[queue] Session abc123 completed after 45.2s
[stage-complete] Stage: prd completed in 45.3s
[stage-started] Executing stage: design (attempt 1/1)
[queue] Spawning agent: documentation-agent
[queue] Agent completed synchronously
[stage-complete] Stage: design completed in 62.1s
[stage-started] Executing stage: api (attempt 1/1)
[stage-complete] Stage: api completed in 38.7s
[workflow-complete] Workflow: project-documentation in 146.1s
```

### Checkpoint Monitoring

Monitor checkpoints in real-time:

```bash
# Watch for workflow checkpoints
tail -f /tmp/agent-checkpoints/*_*.json | jq '.'
```

## Implementation Details

### Topological Sort

The skill uses topological sorting to determine execution order:

1. Build dependency graph from stage definitions
2. Detect circular dependencies (throws error)
3. Sort stages in dependency order (dependents before dependencies)
4. Execute stages sequentially

**Example:**

```javascript
// Input stages
[
    { name: 'api', dependencies: ['design'] },
    { name: 'prd', dependencies: [] },
    { name: 'design', dependencies: ['prd'] }
]

// Execution order: prd → design → api
```

### Stage Executor

Each stage execution:

1. **Wait for dependencies**: Ensure all dependencies completed successfully
2. **Build context**: Call `contextFrom` callback with dependency outputs
3. **Inject context**: Replace `{placeholders}` in task string with context values
4. **Append governance**: Add MANDATORY GOVERNANCE protocols to task
5. **Spawn agent**: Use `openclaw agent` CLI to execute task with assigned agent ID
6. **Poll for completion**: Check `openclaw sessions` every 5 seconds
7. **Collect output**: Capture agent response and save output file
8. **Retry logic**: Handle retries on failure
9. **Checkpoint**: Record stage completion or failure
10. **Return**: Stage result object

### Session Polling

The `waitForCompletion()` helper (Enhanced v2.0):

- Polls `openclaw sessions --json` every 5 seconds
- Checks session.updatedAt timestamp
- Considers session complete if:
  - Inactive for >5 minutes (300s)
  - Status is 'complete' or 'error'
  - Session not found (may have been cleaned up)
- Returns on completion or throws timeout error
- **NEW (v2.0)**: Returns session transcript/results when complete for audit trail

### Governance Protocols (v2.0 Enhanced)

All tasks automatically receive governance protocols (enhanced with tool hook requirements):

```javascript
function appendGovernanceProtocols(task, stageName) {
    return `${task}\n\nMANDATORY GOVERNANCE:
- Follow VERIFICATION_PROTOCOL.md (see /home/optimistprime/.openclaw/workspace/VERIFICATION_PROTOCOL.md)
- Create fix log before making changes
- Use checkpoint.js for progress tracking

COMPLETION EVIDENCE REQUIREMENTS (v2.0):
When you complete this task, you MUST provide completionEvidence in your final response:

{
  "evidenceType": "test-output|screenshot|fix-log|verification-log",
  "filePath": "path/to/evidence/file",
  "testResults": "pass|fail|partial",
  "fixLog": "path/to/fix-log.md" (if applicable),
  "verifiedBy": "stage: ${stageName}",
  "timestamp": "ISO-8601 timestamp"
}

CRITICAL: Return completionEvidence in your final response text as JSON, NOT via the message tool.
- Evidence files must exist on disk
- Empty evidence or "I verified mentally" is INVALID
- Actual test output/logs required (not self-assertions)
- Fix log must exist for code/documentation changes

VERIFICATION REQUIRED:
Complete with VERIFICATION_REQUIRED phrase + valid completionEvidence.
Without evidence = task FAILED.`;
}
```

This ensures all spawned agents:
✅ Follow verification protocols
✅ Create fix logs before making changes
✅ Use checkpoint.js for progress
✅ Provide VERIFICATION_REQUIRED evidence
✅ **NEW (v2.0)**: Return completionEvidence in final response (not via message tool)
✅ **NEW (v2.0)**: Tool hook requirements enforced by validation

### Evidence Validation (v2.0 - Fix #3)

The queue now validates completion evidence after each stage:

**Validation checks:**
1. **Evidence object exists**: Agent must return valid JSON with evidenceType, filePath, testResults
2. **File exists on disk**: Evidence files must actually exist
3. **File age check**: Rejects files created <100ms ago (prevents fake evidence)
4. **File not empty**: Empty evidence files are rejected
5. **No fake markers**: Rejects evidence containing "I checked", "looks good", "verified mentally"
6. **Test output present**: Evidence must contain actual test results (passed/failed counts)
7. **Fix log exists**: For documentation stages, fixLog must exist

**Validation function:**
```javascript
const validation = await validateCompletionEvidence(output, stageName, isDocStage);
if (!validation.valid) {
    throw new Error(`Stage "${stageName}" failed evidence validation: ${validation.errors.join('; ')}`);
}
```

**Example valid evidence:**
```json
{
  "evidenceType": "test-output",
  "filePath": "testing/api-test-log.md",
  "testResults": "all-pass",
  "verifiedBy": "stage: api-integration",
  "timestamp": "2026-02-16T10:30:00.000Z"
}
```

### Git Commit Enforcement (v2.0 - Fix #4)

The queue automatically commits documentation changes after each stage:

**Git checks:**
1. Detects `.md` file changes in working directory
2. Stages all changes with `git add -A`
3. For documentation stages: automatically commits with proper author
4. Commit format: `[stage-name] Complete stage stage-name` with fixLog reference
5. Author: `Vincent [Agent: <stage-name>] <vincent-agent@aomni.com>`
6. Non-documentation changes: staged but not committed

**Usage:**
```javascript
const gitResult = await checkAndCommitChanges(stageName, `Vincent [Agent: ${stageName}]`);
if (gitResult.committed) {
    console.log(`Changes committed for stage: ${stageName}`);
}
```

**Example:**
```
[git-check] Changes detected:
 M docs/DESIGN.md
 M docs/PRD.md

[git-check] Documentation changes detected, requiring commit
[git-check] Changes committed successfully
```

### Auto-progression Validation (v2.0 - Fix #5)

Enhanced executeStage enforces auto-progression only after validation:

**Process:**
1. Execute stage and capture output
2. Wait for session completion (with transcript)
3. Validate completion evidence (rejection if invalid)
4. Check and commit git changes (for doc stages)
5. Only then proceed to next stage

**Workflow integrity:**
- Context from previous stages properly passed via context object
- Topological sort still determines stage order
- Stage only marked "complete" after ALL validations pass
- Checkpoint records validation status

### Abandoned Stage Detection (v2.0 - Fix #6)

The queue detects and flags abandoned stages:

**Detection logic:**
1. Checks if session has been inactive for >10 minutes
2. Checks if output files were written
3. If session inactive but no files → stage abandoned
4. Logs detailed error: session ID, inactivity time, missing outputs
5. Allows workflow to fail gracefully with useful error message

**Usage:**
```javascript
const isAbandoned = await detectAbandonedStage(sessionId, stageName, workingDir);
if (isAbandoned) {
    throw new Error(`Stage "${stageName}" was abandoned: session inactive but no output generated`);
}
```

**Example error report:**
```
[abandon-failed] Stage docs appears abandoned: session inactive for 600s, no output files
[stage-failed] Stage docs failed: Stage "docs" was abandoned
```

### Output Collection (v2.0 Enhanced)

Each stage produces:

```javascript
{
    status: 'complete',
    output: 'Full agent response text',
    file: '/path/stage-name-output.txt',
    startTime: '2025-02-16T16:30:00.000Z',
    endTime: '2025-02-16T16:30:45.000Z',
    duration: 45000,  // milliseconds
    attempts: 1,
    sessionId: 'abc123-or-null',
    evidence: { /* completionEvidence object */ },        // NEW v2.0
    gitCommit: { committed: true, changes: '...' },      // NEW v2.0
    sessionTranscript: [ /* session messages */ ]         // NEW v2.0
}
```

Output files are saved to the workflow's `workingDirectory`.

## Best Practices

### Workflow Design

1. **Keep stages focused**: Each stage should do one thing well
2. **Minimize dependencies**: Fewer dependencies = faster execution
3. **Use descriptive names**: Makes logs and debugging easier
4. **Document context paths**: Clearly comment what context variables are used

```javascript
// Good: Focused, clear purpose
{
    name: 'generate-api-specs',
    task: 'Generate OpenAPI specification from backend design.',
    dependencies: ['backend-design'],
    contextFrom: (outputs) => ({
        designFile: outputs['backend-design'].file
    })
}

// Avoid: Too broad, unclear context
{
    name: 'do-everything',
    task: 'Do all the things with files.',
    dependencies: ['stage1', 'stage2', 'stage3', 'stage4']
}
```

### Error Handling

1. **Set appropriate timeouts**: Longer stages need longer timeouts
2. **Configure retries**: For flaky stages (e.g., network-dependent)
3. **Use stopOnError carefully**: `false` can mask serious failures

```javascript
const robustWorkflow = {
    // Short stages: quick failure
    stageTimeoutMinutes: 5,
    
    stages: [
        {
            name: 'network-heavy',
            task: 'Download and process data...',
            timeoutMinutes: 15,  // Override: needs more time
            retries: 2           // Override: network issues
        }
    ],
    
    // Stop on first failure to catch issues early
    stopOnError: true
};
```

### Context Management

1. **Keep context minimal**: Only pass what's needed
2. **Use file paths**: Pass paths instead of full file contents
3. **Comment context sources**: Note which stage provides what

```javascript
{
    name: 'integration',
    task: 'Create integration tests. Reference frontend at {frontendPath} and backend at {backendPath}.',
    dependencies: ['frontend', 'backend'],
    contextFrom: (outputs) => ({
        // Pass paths, not contents
        frontendPath: outputs.frontend.file,
        backendPath: outputs.backend.file
    })
}
```

### Testing Workflows

Test workflows before production:

```javascript
// Test validation
const validation = validateWorkflow(workflow);
if (!validation.valid) {
    console.error('Invalid workflow:', validation.errors);
    process.exit(1);
}

// Run small test workflow first
const testWorkflow = {
    name: 'test-run',
    stages: [
        {
            name: 'simple-task',
            task: 'Say "hello world" in the output.',
            dependencies: []
        }
    ]
};

const testResult = await executeWorkflow(testWorkflow);
console.log('Test passed:', testResult.success);
```

## Troubleshooting

### Common Issues

**Circular Dependency Detected**

```
Error: Circular dependency detected: api → design → prd → api
```

**Solution:** Remove circular reference. Stages should form a DAG (Directed Acyclic Graph).

**Stage Timeout**

```
Stage "docs" timed out after 15 minutes
```

**Solution:** Increase `timeoutMinutes` for the stage or workflow.

**Agent Spawn Failed**

```
Stage "tests" failed: Error spawning agent
```

**Solution:** Check Gateway is running: `openclaw gateway status`. Verify agent ID exists.

**Session Polling Timeout**

```
Session abc123 did not complete within 900 seconds
```

**Solution:** Agent may be stuck or hanging. Check session status manually:
```bash
openclaw sessions --json | jq '.[] | select(.id == "abc123")'
```

**Governance Protocols Not Applied**

Agents are not following governance protocols.

**Solution:** This shouldn't happen - governance is automatically appended. Verify by checking stage output files - they should include the full task with governance section.

### Debug Mode

Enable verbose logging in your workflow:

```bash
# Run OpenClaw with verbose logging
openclaw agent --message "Your task" --verbose on
```

Queue always logs:
- Dependency graph analysis
- Execution order
- Agent spawn responses
- Session polling status
- Checkpoint writes

## Examples

### Example 1: Documentation Workflow

```javascript
const docWorkflow = {
    name: 'doc-generation',
    stages: [
        {
            name: 'requirements',
            task: 'Create REQUIREMENTS.md with user stories and acceptance criteria for the analytics dashboard.',
            dependencies: []
        },
        {
            name: 'architecture',
            task: 'Design the analytics dashboard architecture. Reference requirements. Include component diagram, tech stack, and data flow. Output ARCHITECTURE.md',
            dependencies: ['requirements'],
            contextFrom: (outputs) => ({ requirements: outputs.requirements.file })
        },
        {
            name: 'api-design',
            task: 'Design REST API endpoints for the analytics dashboard. Reference architecture. Output API-DESIGN.md with all endpoints, methods, schemas, and examples.',
            dependencies: ['architecture'],
            contextFrom: (outputs) => ({ architecture: outputs.architecture.file })
        },
        {
            name: 'ui-design',
            task: 'Design UI mockups and component structure. Reference requirements. Output UI-DESIGN.md with screen flows, components, and styling guidelines.',
            dependencies: ['requirements'],
            contextFrom: (outputs) => ({ requirements: outputs.requirements.file })
        },
        {
            name: 'testing-plan',
            task: 'Create comprehensive testing plan. Reference API design and UI design. Include unit tests, integration tests, and E2E tests. Output TESTING.md',
            dependencies: ['api-design', 'ui-design'],
            contextFrom: (outputs) => ({
                apiDesign: outputs['api-design'].file,
                uiDesign: outputs['ui-design'].file
            })
        }
    ],
    stopOnError: true,
    agentId: 'documentation-team',
    retryOnFailure: 1
};

await executeWorkflow(docWorkflow);
```

### Example 2: Simple Test Workflow

```javascript
const testWorkflow = {
    name: 'test-queue',
    stages: [
        {
            name: 'step1',
            task: 'Create a simple text file called test-output.txt with the current date and time.',
            dependencies: []
        }
    ],
    stopOnError: true,
    stageTimeoutMinutes: 5
};

const result = await executeWorkflow(testWorkflow);
console.log('Test result:', result);
```

### Example 3: Multi-Agent Workflow

```javascript
const multiAgentWorkflow = {
    name: 'multi-agent-pipeline',
    stages: [
        {
            name: 'research',
            task: 'Research the latest trends in AI agents. Summarize key findings.',
            dependencies: [],
            agentId: 'research-agent'
        },
        {
            name: 'architecture',
            task: 'Design an AI agent architecture based on research findings. Reference {researchOutput}.',
            dependencies: ['research'],
            agentId: 'architect-agent',
            contextFrom: (outputs) => ({ researchOutput: outputs.research.file })
        },
        {
            name: 'implementation',
            task: 'Implement the AI agent architecture. Follow the design in {archOutput}.',
            dependencies: ['architecture'],
            agentId: 'developer-agent',
            contextFrom: (outputs) => ({ archOutput: outputs.architecture.file })
        }
    ],
    stopOnError: true,
    retryOnFailure: 1,
    stageTimeoutMinutes: 20
};

await executeWorkflow(multiAgentWorkflow);
```

## Verification

To verify the queue is working correctly after the Antfarm removal:

```bash
# 1. Validate the example workflow
node queue.js validate workflow-test.json

# 2. Run a simple test workflow
node queue.js example

# 3. Check output files
ls -la example-workflow/outputs/

# 4. Verify governance protocols in task
cat example-workflow/outputs/*-output.txt | grep "MANDATORY GOVERNANCE"
```

**Expected verification results:**
- ✅ No Antfarm references in any output
- ✅ `openclaw agent` CLI is used for spawning
- ✅ Session polling occurs (check logs for "[queue] Waiting for session")
- ✅ Governance protocols appear in all stage outputs
- ✅ Stages execute sequentially (no parallel execution)

## License

This skill is part of OpenClaw workspace.

## Contributing

To improve this skill:

1. Update SKILL.md with new features or examples
2. Test workflows before committing changes
3. Document breaking changes
4. Ensure checkpoint integration remains functional
5. Verify governance protocols are embedded correctly

---

**Version:** 2.0.0 (Architecture Update - Antfarm Removal)
**Last Updated:** 2026-02-16
**Author:** Vincent [Agent: skill-architect-update]
**Changes from 1.0.0:**
- Removed all Antfarm dependencies
- Implemented OpenClaw agent CLI spawning
- Added session polling for completion tracking
- Embedded governance protocols in all tasks
- Updated documentation to reflect new architecture