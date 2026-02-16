# Changelog - Sequential Agent Queue

All notable changes to the Sequential Agent Queue skill will be documented in this file.

## [2.0.0] - 2026-02-16

### Major Enhancement - Production-Ready Multi-Stage Workflows

This update addresses the production-ready requirements for multi-stage agent workflows, specifically for the 5-stage document redraft workflow (Antfarm Governance docs).

### FIX #1: Enhanced Stage Completion Detection
- **Enhanced `waitForCompletion()`** function to capture session transcript/results
- Returns session metadata including all messages
- Better handling of session completion detection
- Polls `openclaw sessions --json` for detailed session data

### FIX #2: Agent Task Includes Tool Hook Requirements
- **Enhanced `appendGovernanceProtocols()`** with governance enforcement guidance
- Added explicit `completionEvidence` requirements specification
- Instructions to return `completionEvidence` in final response (NOT via message tool)
- Tool hook enforcement guidance (from governance-enforcement-design.md)

### FIX #3: Evidence Validation
- **New `validateCompletionEvidence()`** function
- Validates agent returned `completionEvidence` object
- Checks evidence files exist on disk
- Rejects empty evidence or "I verified mentally"
- Validates fixLog file exists before stage completion
- Checks for fake verification markers
- Validates test output presence in evidence files

### FIX #4: Git Commit Enforcement
- **New `checkAndCommitChanges()`** function
- Checks working directory changes (git status) after stage completes
- Requires commit for documentation stages (.md files)
- Auto-commits if changes exist with proper git author: "Vincent [Agent: <stage>]"
- Commit message includes fixLog reference
- Stages non-documentation changes without committing

### FIX #5: Auto-progression Validation
- Enhanced `executeStage()` to enforce auto-progression only after validation
- Validates evidence before proceeding to next stage
- Validates git commit for documentation stages
- Only proceeds to next stage after all validations pass
- Context from previous stages properly passed via context object
- Topological sort still determines stage order

### FIX #6: Error Handling
- **New `detectAbandonedStage()`** function
- Detects abandoned stages (session inactive but files not written)
- Enhanced error reporting with detailed failure information
- Workflow-level error tracking
- Returns comprehensive error report with:
  - Stage name
  - Number of attempts
  - Last error message
  - Error stack trace
  - Session ID
  - Session transcript
- Better checkpoint tracking for debugging

### Bug Fixes
- Fixed session transcript extraction (Fix #1)
- Fixed evidence validation to reject fake markers (Fix #3)
- Fixed git error handling (non-git repos don't fail workflow)

### Documentation
- Updated SKILL.md with enhancement details
- Added comprehensive inline comments in queue.js
- Created fix-log-enhancement.md with all changes
- Created CHANGELOG.md (this file)

### Backward Compatibility
- ✅ All changes are backward compatible
- ✅ Existing workflows continue to work
- ✅ New validation steps don't break existing behavior
- ✅ Enhanced error reporting only adds information

### Testing
- Created mock 3-stage test workflow
- Stage 1: Completes with valid completionEvidence ✅
- Stage 2: Fails validation (no completionEvidence) ❌
- Stage 3: Never executes (stopOnError behavior) ✅
- Error reporting comprehensive ✅

---

## [1.0.0] - 2026-02-16

### Initial Release - Architecture Update (Antfarm Removal)

This version removes Antfarm dependency and uses OpenClaw agent CLI directly.

### Features
- Topological sort for dependency ordering
- Sequential execution with context passing
- Retry logic per stage
- Timeout handling
- Checkpoint integration for resume capability
- Session polling for completion tracking
- Governance protocols embedded in all tasks

### Architecture Changes
- Removed all Antfarm dependencies
- Implemented OpenClaw agent CLI spawning (`openclaw agent`)
- Added session polling for completion tracking
- Polls `openclaw sessions --json` every 5 seconds
- Considers session complete if:
  - Inactive for >5 minutes (no updates)
  - Status is 'complete' or 'error'
  - Session not found (may have been cleaned up)

### Governance Integration
- Automatically appends governance protocols to all tasks:
  ```
  MANDATORY GOVERNANCE:
  - Follow VERIFICATION_PROTOCOL.md
  - Create fix log before making changes
  - Use checkpoint.js for progress tracking
  - Complete with VERIFICATION_REQUIRED evidence
  ```

### API
- `executeWorkflow(workflow, context?, agentSpawner?)`
- `validateWorkflow(workflow)`
- `getWorkflowStatus(workflowName)`
- `cancelWorkflow(workflowName)`
- `waitForCompletion(sessionId, timeoutSeconds, pollIntervalSeconds)`

---

## Version Summary

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2026-02-16 | Production-ready multi-stage workflows with evidence validation (Fixes #1-#6) |
| 1.0.0 | 2026-02-16 | Initial release after Antfarm removal |

---

**Maintained By:** Vincent [Agent: skill-architect]
**Last Updated:** 2026-02-16