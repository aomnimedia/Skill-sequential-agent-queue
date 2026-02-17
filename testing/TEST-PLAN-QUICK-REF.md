# Test Plan Quick Reference

**Full Test Plan:** `testing/TEST-PLAN.md`
**Author:** QA (Expert)
**Date:** 2026-02-16

---

## Test Summary

| Metric | Value |
|--------|-------|
| **Total Test Cases** | 32 |
| **P0 Critical** | 11 |
| **P1 High Priority** | 14 |
| **P2 Medium Priority** | 7 |
| **Automated Tests** | 16 |
| **Semi-Automated** | 12 |
| **Manual Tests** | 4 |

---

## Top Priority Tests (P0 - Must Pass)

**Execute these first. Any failure blocks release.**

### Iteration Loop (5 tests)
| Test | Description |
|------|-------------|
| TC-1.1.1 | Normal flow - no iteration |
| TC-1.1.2 | Single iteration - gaps detected then resolved |
| TC-1.1.3 | Max iterations reached - persistent gaps |
| TC-1.5.1 | Evidence JSON parsing for gaps |
| TC-1.5.3 | Priority filtering (HIGH only) |

### Error Handling (3 tests)
| Test | Description |
|------|-------------|
| TC-2.1.1 | Agent spawn failure handling |
| TC-2.1.2 | Spawn failure with retry logic |
| TC-2.2.1 | Stage timeout detection |

### Integration (3 tests)
| Test | Description |
|------|-------------|
| TC-3.1.1 | All 9 stages execute successfully |
| TC-3.1.2 | Topological sort correctness |
| TC-3.2.1 | All 7 agents spawn and execute |

---

## Test Execution Order

### Phase 1: Unit Tests (1-2 hours)
**Command:** `node testing/unit/run-tests.js`

**P0 Tests:**
1. TC-1.1.1 - TC-1.1.3 (Iteration loop logic)
2. TC-1.5.1, TC-1.5.3 (Gap detection)
3. TC-2.3.1 - TC-2.3.4 (Transcript validation)
4. TC-3.1.2 - TC-3.1.4 (Validation logic)

**Success Criteria:** All P0 unit tests passing

**Output:** `testing/unit/test-results.md`

---

### Phase 2: Integration Tests (4-6 hours)
**Command:** `node testing/integration/run-tests.js`

**P0 Tests:**
1. TC-1.1.1 through TC-1.1.3 (Full iteration test with real agents)
2. TC-3.1.1 (Full 9-stage workflow)
3. TC-3.2.1 (All 7 agents)

**P1 Tests:**
4. TC-1.2.1, TC-1.3.1, TC-1.4.2
5. TC-1.5.2 (Transcript fallback)
6. TC-2.1.1 - TC-2.1.3
7. TC-3.2.2, TC-3.3.1 - TC-3.3.3, TC-3.5.1

**Success Criteria:** All P0 tests passing, P1 tests passing or minor defects

**Output:** `testing/integration/test-results.md`

---

### Phase 3: Manual Tests (2-4 hours)
**Executor:** Human verification

**P1 Tests:**
1. TC-2.2.1 - Stage timeout (needs real agent, verify timeout behavior)
2. TC-2.5.1 - Abandoned stage detection (wait >10 min for inactivity)

**P2 Tests:**
3. TC-2.5.2 - Session inactive but has outputs
4. TC-3.3.1 - TC-3.3.3 (Git commits - verify git log manually)

**Success Criteria:** All manual tests verified with evidence

**Output:** `testing/manual/test-results.md`

---

### Phase 4: Performance Tests (1 hour - Optional)
**Command:** `node testing/performance/run-tests.js`

**Tests:**
1. Full 9-stage workflow execution time (<15 minutes)
2. Single stage execution time (<3 minutes each)
3. Iteration overhead (time penalty for restart)
4. Memory usage (no leaks)

**Success Criteria:** All performance metrics within spec

**Output:** `testing/performance/test-results.md`

---

## Quick Test Commands

### Run all unit tests
```bash
cd ~/skill-sequential-agent-queue
node testing/unit/run-tests.js
```

### Run all integration tests
```bash
cd ~/skill-sequential-agent-queue
node testing/integration/run-tests.js
```

### Run specific test
```bash
cd ~/skill-sequential-agent-queue
node testing/unit/run-tests.js --test TC-1.1.1
```

### Verify queue structure
```bash
cd ~/skill-sequential-agent-queue
node verify.js
```

---

## Test Workflows

| Workflow | File | Purpose |
|----------|------|---------|
| No gaps | `testing/workflows/no-gaps.json` | TC-1.1.1 |
| Single iteration | `testing/workflows/single-iteration.json` | TC-1.1.2 |
| Max iterations | `testing/workflows/max-iterations.json` | TC-1.1.3 |
| Disabled | `testing/workflows/iteration-disabled.json` | TC-1.3.1 |
| Full workflow | `testing/workflows/full-9-stage.json` | TC-3.1.1 |

---

## Verification Checklist

Before declaring testing complete:

- [ ] **Phase 1 Complete:** All P0 unit tests passing
- [ ] **Phase 2 Complete:** All P0 integration tests passing
- [ ] **Phase 3 Complete:** All P1 manual tests verified
- [ ] **Defects Logged:** All defects in `testing/defects.md`
- [ ] **Limitations Documented:** All testing limitations in `testing/test-limitations.md`
- [ ] **Evidence Captured:** Screenshots, logs, outputs saved
- [ ] **Test Results:** `testing/test-results.md` complete
- [ ] **Performance Metrics:** Within spec (optional phase)

---

## Release Criteria

### APPROVE (Release Ready)
- ✅ All 11 P0 tests passing
- ✅ 14 P1 tests passing (or non-blocking defects only)
- ✅ No critical or high-priority defects
- ✅ Evidence logged for all tests

### DEFER (Needs Review)
- ✅ All 11 P0 tests passing
- ⚠️ Some P1 tests failing
- ⚠️ Medium-priority defects present
- 📋 Review with Vincent required

### REJECT (Block Release)
- ❌ Any P0 test failing
- ❌ Critical or high-priority defects found
- ❌ Missing evidence for critical tests

---

## Defect Tracking

**Defect Log:** `testing/defects.md`
**Defect Template:** `testing/defects-template.md`

**Severity Levels:**
- **Critical (P0):** Release blocker, must fix
- **High (P1):** Important for production, should fix
- **Medium (P2):** Edge case, can defer

**IMPORTANT:** Only log code defects. Testing limitations go in `testing/test-limitations.md`.

---

## Testing Limitations

**Template:** `testing/test-limitations-template.md`

Common limitations (NOT defects):
- ❌ Browser tool unavailable in sub-agent session (environment)
- ❌ Specific browser not available (tool)
- ❌ External API down during testing (dependency)
- ❌ Slow test requiring 30+ minutes (time)

---

## Status Tracking

**Current Status:** ⏸️ AWAITING IMPLEMENTATION

**Blockers:**
1. ⏸️ ARCHIE architecture review - Pending
2. ⏸️ CODER implementation - Pending

**Next Steps:**
1. ⏸️ Wait for ARCHIE review complete
2. ⏸️ Wait for CODER implementation complete
3. ▶️ Execute Phase 1: Unit tests
4. ▶️ Execute Phase 2: Integration tests
5. ▶️ Execute Phase 3: Manual tests
6. ▶️ Execute Phase 4: Performance tests (optional)
7. ✅ Report final verification

---

## Contact

**QA Expert:** Testing and verification authority
**Full Test Plan:** `testing/TEST-PLAN.md`
**Defects:** `testing/defects.md`
**Results:** `testing/test-results.md`

---

**VERIFICATION_REQUIRED:** All tests logged with evidence, defects cataloged, pass/fail status documented.

**Last Updated:** 2026-02-16 by QA (Expert)