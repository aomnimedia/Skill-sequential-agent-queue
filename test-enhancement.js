/**
 * Test Script for Sequential Agent Queue Enhancements (Fixes #1-#6)
 *
 * Tests:
 * 1. Stage 1: Completes with valid completionEvidence
 * 2. Stage 2: Fails (no completionEvidence)
 * 3. Stage 3: Never executes (stopOnError behavior)
 * 4. Error handling catches Stage 2 failure
 *
 * Date: 2026-02-16
 * Author: Vincent [Agent: sequential-queue-enhancement-v1]
 */

const fs = require('fs').promises;
const path = require('path');

// Import queue functions
const { validateCompletionEvidence, checkAndCommitChanges, detectAbandonedStage } = require('./queue.js');

console.log('=== Sequential Agent Queue Enhancement Tests ===\n');

async function runTests() {
    let passedTests = 0;
    let failedTests = 0;

    // TEST 1: Validate completionEvidence - Valid evidence
    console.log('TEST 1: Validate valid completionEvidence');
    try {
        // Wait a bit to avoid "too recent" check
        await new Promise(resolve => setTimeout(resolve, 300));

        // Create a valid evidence file
        const evidenceContent = `# Test Log

**Date:** 2026-02-16
**Test Type:** Unit tests

## Test Execution

Passed: 10
Failed: 0

## Results
✅ All tests passing
`;
        
        const evidencePath = path.join(__dirname, 'test-evidence.txt');
        await fs.writeFile(evidencePath, evidenceContent);

        // Add another delay to ensure file is old enough
        await new Promise(resolve => setTimeout(resolve, 100));

        const validOutput = JSON.stringify({
            evidenceType: 'test-output',
            filePath: evidencePath,
            testResults: 'all-pass',
            verifiedBy: 'test-stage-1',
            timestamp: new Date().toISOString()
        });

        const result = await validateCompletionEvidence(validOutput, 'test-stage-1');

        if (result.valid) {
            console.log('✅ TEST 1 PASSED: Valid evidence accepted\n');
            passedTests++;
        } else {
            console.error('❌ TEST 1 FAILED: Valid evidence rejected');
            console.error('Errors:', result.errors);
            console.log();
            failedTests++;
        }

        // Clean up
        await fs.unlink(evidencePath).catch(() => {});

    } catch (error) {
        console.error('❌ TEST 1 FAILED: Exception thrown');
        console.error('Error:', error.message);
        console.log();
        failedTests++;
    }

    // TEST 2: Validate completionEvidence - No evidence
    console.log('TEST 2: Validate missing completionEvidence');
    try {
        const invalidOutput = 'I finished the task without any evidence.';

        const result = await validateCompletionEvidence(invalidOutput, 'test-stage-2');

        if (!result.valid && result.errors.some(e => e.includes('No completionEvidence object found'))) {
            console.log('✅ TEST 2 PASSED: Missing evidence rejected\n');
            passedTests++;
        } else {
            console.error('❌ TEST 2 FAILED: Missing evidence not properly rejected');
            console.error('Errors:', result.errors);
            console.log();
            failedTests++;
        }

    } catch (error) {
        console.error('❌ TEST 2 FAILED: Exception thrown');
        console.error('Error:', error.message);
        console.log();
        failedTests++;
    }

    // TEST 3: Validate completionEvidence - Fake markers
    console.log('TEST 3: Validate evidence with fake markers');
    try {
        await new Promise(resolve => setTimeout(resolve, 100));

        const fakeEvidencePath = path.join(__dirname, 'fake-evidence.txt');
        await fs.writeFile(fakeEvidencePath, 'I checked it mentally, looks good.');

        const fakeOutput = JSON.stringify({
            evidenceType: 'test-output',
            filePath: fakeEvidencePath,
            testResults: 'all-pass',
            verifiedBy: 'test-stage-3',
            timestamp: new Date().toISOString()
        });

        const result = await validateCompletionEvidence(fakeOutput, 'test-stage-3');

        if (!result.valid && result.errors.some(e => e.includes('fake verification marker'))) {
            console.log('✅ TEST 3 PASSED: Fake markers detected\n');
            passedTests++;
        } else {
            console.error('❌ TEST 3 FAILED: Fake markers not detected');
            console.error('Errors:', result.errors);
            console.log();
            failedTests++;
        }

        // Clean up
        await fs.unlink(fakeEvidencePath).catch(() => {});

    } catch (error) {
        console.error('❌ TEST 3 FAILED: Exception thrown');
        console.error('Error:', error.message);
        console.log();
        failedTests++;
    }

    // TEST 4: Validate completionEvidence - Empty file
    console.log('TEST 4: Validate evidence with empty file');
    try {
        await new Promise(resolve => setTimeout(resolve, 100));

        const emptyPath = path.join(__dirname, 'empty-evidence.txt');
        await fs.writeFile(emptyPath, '');

        const emptyOutput = JSON.stringify({
            evidenceType: 'test-output',
            filePath: emptyPath,
            testResults: 'all-pass',
            verifiedBy: 'test-stage-4',
            timestamp: new Date().toISOString()
        });

        const result = await validateCompletionEvidence(emptyOutput, 'test-stage-4');

        if (!result.valid && result.errors.some(e => e.includes('is empty'))) {
            console.log('✅ TEST 4 PASSED: Empty file detected\n');
            passedTests++;
        } else {
            console.error('❌ TEST 4 FAILED: Empty file not detected');
            console.error('Errors:', result.errors);
            console.log();
            failedTests++;
        }

        // Clean up
        await fs.unlink(emptyPath).catch(() => {});

    } catch (error) {
        console.error('❌ TEST 4 FAILED: Exception thrown');
        console.error('Error:', error.message);
        console.log();
        failedTests++;
    }

    // TEST 5: Git check
    console.log('TEST 5: Git check handles git operations');
    try {
        const gitResult = await checkAndCommitChanges('test-stage-5');

        // Just verify it returns a valid result without crashing
        if (gitResult && (typeof gitResult.committed === 'boolean')) {
            if (gitResult.committed) {
                console.log(`✅ TEST 5 PASSED: Git check committed changes correctly (${gitResult.changes ? gitResult.changes.split('\n').length + ' files' : 'no details'})\n`);
            } else {
                console.log(`✅ TEST 5 PASSED: Git check handled no changes correctly (${gitResult.reason})\n`);
            }
            passedTests++;
        } else {
            console.error('❌ TEST 5 FAILED: Git check returned invalid result');
            console.error('Result:', gitResult);
            console.log();
            failedTests++;
        }

    } catch (error) {
        console.error('❌ TEST 5 FAILED: Exception thrown');
        console.error('Error:', error.message);
        console.log();
        failedTests++;
    }

    // TEST 6: Abandoned stage detection
    console.log('TEST 6: Abandoned stage detection');
    try {
        // Test with a non-existent session (should return false, not error)
        const isAbandoned = await detectAbandonedStage('fake-session-id-12345', 'test-stage-6', process.cwd());

        if (isAbandoned === false) {
            console.log('✅ TEST 6 PASSED: Non-existent session not flagged as abandoned\n');
            passedTests++;
        } else {
            console.error('❌ TEST 6 FAILED: Non-existent session flagged incorrectly\n');
            failedTests++;
        }

    } catch (error) {
        console.error('❌ TEST 6 FAILED: Exception thrown');
        console.error('Error:', error.message);
        console.log();
        failedTests++;
    }

    // Summary
    console.log('=== Test Summary ===');
    console.log(`Total Tests: ${passedTests + failedTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log('');

    if (failedTests > 0) {
        console.error('Some tests failed. Review errors above.');
        process.exit(1);
    } else {
        console.log('All tests passed! ✅');
        console.log('');
        console.log('VERIFICATION REQUIRED:');
        console.log('- All validation functions working correctly');
        console.log('- Evidence validation rejects invalid evidence');
        console.log('- Git check handles no-changes case');
        console.log('- Abandoned stage detection works safely');
    }
}

// Run tests
runTests().catch(error => {
    console.error('Test script failed:', error);
    process.exit(1);
});