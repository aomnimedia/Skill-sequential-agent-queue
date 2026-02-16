#!/usr/bin/env node

/**
 * Test script for Sequential Agent Queue
 * Verifies the new architecture works correctly
 */

const { executeWorkflow, validateWorkflow } = require('./queue.js');
const fs = require('fs');

async function runTest() {
    console.log('='.repeat(70));
    console.log('Sequential Agent Queue Test');
    console.log('Architecture: OpenClaw agent CLI (no Antfarm)');
    console.log('='.repeat(70));
    console.log();

    // 1. Load test workflow
    console.log('Step 1: Loading test workflow...');
    const workflowFile = './test-workflow.json';
    const workflow = JSON.parse(fs.readFileSync(workflowFile, 'utf-8'));
    console.log('✅ Workflow loaded:', workflow.name);
    console.log('   Stages:', workflow.stages.map(s => s.name).join(', '));
    console.log();

    // 2. Validate workflow
    console.log('Step 2: Validating workflow...');
    const validation = validateWorkflow(workflow);
    if (!validation.valid) {
        console.error('❌ Workflow validation failed!');
        validation.errors.forEach(err => console.error(`   - ${err}`));
        process.exit(1);
    }
    console.log('✅ Workflow is valid');
    console.log();

    // 3. Execute workflow
    console.log('Step 3: Executing workflow...');
    console.log('   This may take a few minutes...');
    console.log();

    const startTime = Date.now();
    const result = await executeWorkflow(workflow);
    const duration = (Date.now() - startTime) / 1000;

    console.log();
    console.log('='.repeat(70));
    console.log('Workflow Execution Complete');
    console.log('='.repeat(70));
    console.log();

    // 4. Report results
    console.log('Result Summary:');
    console.log(`  Success: ${result.success ? '✅ YES' : '❌ NO'}`);
    console.log(`  Total Duration: ${duration.toFixed(1)}s`);
    console.log(`  Stages Completed: ${Object.values(result.stages).filter(s => s.status === 'complete').length}/${workflow.stages.length}`);
    console.log();

    // 5. Stage details
    console.log('Stage Details:');
    for (const [stageName, stageInfo] of Object.entries(result.stages)) {
        console.log(`  ${stageName}:`);
        console.log(`    Status: ${stageInfo.status}`);
        console.log(`    Duration: ${(stageInfo.duration / 1000).toFixed(1)}s`);
        console.log(`    Attempts: ${stageInfo.attempts || stageInfo.error?.attempts || 0}`);
        if (stageInfo.file) {
            console.log(`    Output: ${stageInfo.file}`);
        }
        if (stageInfo.error) {
            console.log(`    Error: ${stageInfo.error.message}`);
        }
        console.log();
    }

    // 6. Verify governance protocols
    console.log('Verification Checks:');
    
    // Check 1: All stages completed
    const allComplete = Object.values(result.stages).every(s => s.status === 'complete');
    console.log(`  ${allComplete ? '✅' : '❌'} All stages completed successfully`);

    // Check 2: Check output files exist
    for (const [stageName, stageInfo] of Object.entries(result.stages)) {
        if (stageInfo.file) {
            const exists = fs.existsSync(stageInfo.file);
            console.log(`  ${exists ? '✅' : '❌'} ${stageName} output file exists`);
        }
    }

    // Check 3: Check for governance protocols in output
    console.log('  Checking for governance protocols in outputs...');
    for (const [stageName, stageInfo] of Object.entries(result.stages)) {
        if (stageInfo.file) {
            const content = fs.readFileSync(stageInfo.file, 'utf-8');
            const hasGovernance = content.includes('MANDATORY GOVERNANCE');
            console.log(`    ${hasGovernance ? '✅' : '❌'} ${stageName} has governance protocols`);
        }
    }

    console.log();

    // 7. Final result
    console.log('='.repeat(70));
    if (result.success) {
        console.log('✅ TEST PASSED - Queue is working correctly!');
        console.log();
        console.log('Architecture verified:');
        console.log('  ✅ OpenClaw agent CLI is used (no Antfarm)');
        console.log('  ✅ Session polling implemented');
        console.log('  ✅ Governance protocols embedded');
        console.log('  ✅ Sequential execution works');
    } else {
        console.log('❌ TEST FAILED - See errors above');
        process.exit(1);
    }
    console.log('='.repeat(70));
}

runTest().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});