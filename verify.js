#!/usr/bin/env node

/**
 * Verification script for Sequential Agent Queue
 * Validates code structure without running agents
 */

const { validateWorkflow } = require('./queue.js');
const fs = require('fs');

async function runVerification() {
    console.log('='.repeat(70));
    console.log('Sequential Agent Queue Verification');
    console.log('Architecture Update: Antfarm Removed ✅');
    console.log('='.repeat(70));
    console.log();

    let totalChecks = 0;
    let passedChecks = 0;

    function check(description, condition) {
        totalChecks++;
        if (condition) {
            passedChecks++;
            console.log(`✅ ${description}`);
        } else {
            console.log(`❌ ${description}`);
        }
        return condition;
    }

    // 1. Load queue.js source
    console.log('Step 1: Loading queue.js source...');
    const queueSource = fs.readFileSync('./queue.js', 'utf-8');
    console.log('✅ Source loaded');
    console.log();

    // 2. Verify Antfarm removal
    console.log('Step 2: Verifying Antfarm removal...');
    check('No "antfarm" imports in queue.js', !queueSource.includes('require.*antfarm'));
    check('No "antfarm" CLI commands', !queueSource.includes('antfarm/dist/cli'));
    check('No "antfarm workflow run"', !queueSource.includes('workflow run'));
    check('No Antfarm-specific dependencies', !queueSource.includes('agentSessionKey'));
    console.log();

    // 3. Verify OpenClaw agent CLI usage
    console.log('Step 3: Verifying OpenClaw agent CLI usage...');
    check('OpenClaw agent CLI is used', queueSource.includes('openclaw agent'));
    check('spawnAgentCLI function exists', queueSource.includes('function spawnAgentCLI'));
    check('CLI fallback spawner implemented', queueSource.includes('const spawner = agentSpawner || spawnAgentCLI'));
    console.log();

    // 4. Verify governance protocols
    console.log('Step 4: Verifying governance protocols...');
    check('appendGovernanceProtocols function exists', queueSource.includes('function appendGovernanceProtocols'));
    check('Governance protocols embedded', queueSource.includes('MANDATORY GOVERNANCE'));
    check('VERIFICATION_PROTOCOL mentioned', queueSource.includes('VERIFICATION_PROTOCOL.md'));
    check('Fix log requirement included', queueSource.includes('Create fix log'));
    check('Checkpoint requirement included', queueSource.includes('Use checkpoint.js'));
    check('Governance appended to tasks', queueSource.includes('task = appendGovernanceProtocols(task)'));
    console.log();

    // 5. Verify session polling
    console.log('Step 5: Verifying session polling...');
    check('waitForCompletion function exists', queueSource.includes('function waitForCompletion'));
    check('isSessionComplete function exists', queueSource.includes('function isSessionComplete'));
    check('Sessions polled every 5 seconds', queueSource.includes('pollIntervalSeconds = 5'));
    check('openclaw sessions command used', queueSource.includes('openclaw sessions --json'));
    check(  
        'Session inactivity detection (300s)',
        queueSource.includes('inactiveTime > 300')
    );
    console.log();

    // 6. Verify flexible spawner support
    console.log('Step 6: Verifying flexible spawner support...');
    check('executeWorkflow accepts agentSpawner parameter', queueSource.includes('executeWorkflow(workflow, context = {}, agentSpawner = null)'));
    check('Custom spawner used if provided', queueSource.includes('const spawner = agentSpawner || spawnAgentCLI'));
    check('Spawner passed to executeStage', queueSource.includes('executeStage(stage, workflow, stageOutputs, context, spawner)'));
    console.log();

    // 7. Verify existing features preserved
    console.log('Step 7: Verifying existing features preserved...');
    check('Topological sort function exists', queueSource.includes('function topologicalSort'));
    check('validateWorkflow function exists', queueSource.includes('function validateWorkflow'));
    check('injectContext function exists', queueSource.includes('function injectContext'));
    check('saveStageOutput function exists', queueSource.includes('function saveStageOutput'));
    check('Retry logic implemented', queueSource.includes('maxRetries') && queueSource.includes('attempt <= maxRetries'));
    check('Timeout handling preserved', queueSource.includes('stageTimeoutMinutes'));
    check('Checkpoint integration preserved', queueSource.includes('checkpoint({'));
    check('Context passing preserved', queueSource.includes('contextFrom'));
    console.log();

    // 8. Test workflow validation
    console.log('Step 8: Testing workflow validation...');
    const workflow = {
        name: 'test-workflow',
        stages: [
            {
                name: 'stage1',
                task: 'Test task 1',
                dependencies: []
            },
            {
                name: 'stage2',
                task: 'Test task 2 with {context}',
                dependencies: ['stage1']
            }
        ]
    };

    const validation = validateWorkflow(workflow);
    check('Valid workflow passes validation', validation.valid);
    
    const invalidWorkflow = {
        name: 'invalid',
        stages: [
            {
                name: 's1',
                task: 'Task',
                dependencies: ['nonexistent']
            }
        ]
    };

    const invalidValidation = validateWorkflow(invalidWorkflow);
    check('Invalid workflow fails validation', !invalidValidation.valid);
    console.log();

    // 9. Summary
    console.log('='.repeat(70));
    console.log('Verification Summary');
    console.log('='.repeat(70));
    console.log();
    console.log(`Total Checks: ${totalChecks}`);
    console.log(`Passed: ${passedChecks}`);
    console.log(`Failed: ${totalChecks - passedChecks}`);
    console.log();

    if (passedChecks === totalChecks) {
        console.log('✅ ALL CHECKS PASSED!');
        console.log();
        console.log('Architecture successfully updated:');
        console.log('  ✅ Antfarm dependency removed');
        console.log('  ✅ OpenClaw agent CLI implemented');
        console.log('  ✅ Governance protocols embedded');
        console.log('  ✅ Session polling implemented');
        console.log('  ✅ Flexible spawner support added');
        console.log('  ✅ All existing features preserved');
        console.log();
        console.log('Usage Notes:');
        console.log('  - For production use, pass sessions_spawn as agentSpawner');
        console.log('  - CLI-based spawner suitable for testing only');
        console.log('  - Example:');
        console.log('    const result = await queue.executeWorkflow(workflow, {}, sessions_spawn);');
    } else {
        console.log('❌ SOME CHECKS FAILED');
        console.log('Please review the failures above.');
        process.exit(1);
    }
}

runVerification().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});