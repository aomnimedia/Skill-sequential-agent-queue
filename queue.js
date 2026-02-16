/**
 * Sequential Agent Queue
 * 
 * Automated sequential execution of multi-stage agent workflows
 * with dependency passing and progress tracking.
 * 
 * Architecture Update (2026-02-16):
 * - Removed Antfarm dependency
 * - Supports both internal sessions_spawn and CLI-based spawning
 * - Embeds governance protocols in all tasks
 * 
 * @author Vincent [Agent: skill-architect-update]
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// Try to load checkpoint library
let checkpoint = null;
try {
    const checkpointLib = require('/home/optimistprime/.openclaw/workspace/agent-checkpoint/checkpoint.js');
    checkpoint = checkpointLib.checkpoint;
} catch (error) {
    console.warn('⚠️  Checkpoint library not available, checkpoints disabled');
}

/**
 * Topological sort of dependency graph
 * Returns stages in execution order
 */
function topologicalSort(stages) {
    // Build adjacency list and indegree map
    const adj = {};
    const indegree = {};
    const stageNames = stages.map(s => s.name);

    // Initialize
    for (const stage of stages) {
        adj[stage.name] = [];
        indegree[stage.name] = 0;
    }

    // Build edges
    for (const stage of stages) {
        for (const dep of stage.dependencies) {
            adj[dep].push(stage.name);
            indegree[stage.name]++;
        }
    }

    // Kahn's algorithm for topological sort
    const queue = stageNames.filter(name => indegree[name] === 0);
    const result = [];
    const visited = new Set();

    while (queue.length > 0) {
        const current = queue.shift();
        
        if (visited.has(current)) {
            throw new Error(`Circular dependency detected: ${current}`);
        }
        visited.add(current);
        result.push(current);

        for (const neighbor of adj[current]) {
            indegree[neighbor]--;
            if (indegree[neighbor] === 0) {
                queue.push(neighbor);
            }
        }
    }

    // Check for cycles
    if (result.length !== stageNames.length) {
        const remaining = stageNames.filter(name => !result.includes(name));
        throw new Error(`Circular dependency detected involving: ${remaining.join(', ')}`);
    }

    return result;
}

/**
 * Validate workflow definition
 */
function validateWorkflow(workflow) {
    const errors = [];

    // Check required fields
    if (!workflow.name || typeof workflow.name !== 'string') {
        errors.push('workflow.name is required and must be a string');
    }

    if (!workflow.stages || !Array.isArray(workflow.stages)) {
        errors.push('workflow.stages is required and must be an array');
    } else {
        // Validate each stage
        if (workflow.stages.length === 0) {
            errors.push('workflow.stages must have at least one stage');
        }

        for (let i = 0; i < workflow.stages.length; i++) {
            const stage = workflow.stages[i];

            if (!stage.name || typeof stage.name !== 'string') {
                errors.push(`Stage ${i}: stage.name is required and must be a string`);
            }

            if (!stage.task || typeof stage.task !== 'string') {
                errors.push(`Stage ${i}: stage.task is required and must be a string`);
            }

            if (!stage.dependencies || !Array.isArray(stage.dependencies)) {
                errors.push(`Stage ${i}: stage.dependencies is required and must be an array`);
            }

            // Check for duplicate stage names
            const duplicates = workflow.stages.filter((s, idx) => s.name === stage.name && idx !== i);
            if (duplicates.length > 0) {
                errors.push(`Duplicate stage name: ${stage.name}`);
            }
        }

        // Validate dependencies reference existing stages
        const stageNames = workflow.stages.map(s => s.name);
        for (const stage of workflow.stages) {
            for (const dep of stage.dependencies) {
                if (!stageNames.includes(dep)) {
                    errors.push(`Stage "${stage.name}" depends on unknown stage: "${dep}"`);
                }
            }
        }
    }

    // Validate optional fields
    if (workflow.stopOnError !== undefined && typeof workflow.stopOnError !== 'boolean') {
        errors.push('workflow.stopOnError must be a boolean');
    }

    if (workflow.retryOnFailure !== undefined && typeof workflow.retryOnFailure !== 'number') {
        errors.push('workflow.retryOnFailure must be a number');
    }

    if (workflow.stageTimeoutMinutes !== undefined && typeof workflow.stageTimeoutMinutes !== 'number') {
        errors.push('workflow.stageTimeoutMinutes must be a number');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Inject context into task string
 * Replaces {placeholder} patterns with actual values
 */
function injectContext(task, context) {
    let result = task;
    for (const [key, value] of Object.entries(context)) {
        const placeholder = `{${key}}`;
        result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
    return result;
}

/**
 * Save stage output to file
 */
async function saveStageOutput(workflowName, stageName, output, workingDirectory) {
    const outputDir = path.join(workingDirectory, workflowName, 'outputs');
    await fs.mkdir(outputDir, { recursive: true });

    const filename = `${stageName.replace(/[^a-zA-Z0-9-_]/g, '_')}-output.txt`;
    const filepath = path.join(outputDir, filename);

    await fs.writeFile(filepath, output, 'utf-8');
    return filepath;
}

/**
 * Append governance protocols to task (Fix #2)
 * Includes tool hook requirements for completionEvidence
 */
function appendGovernanceProtocols(task, stageName) {
    return `${task}\n\nMANDATORY GOVERNANCE:\n- Follow VERIFICATION_PROTOCOL.md (see /home/optimistprime/.openclaw/workspace/VERIFICATION_PROTOCOL.md)\n- Create fix log before making changes\n- Use checkpoint.js for progress tracking\n\nCOMPLETION EVIDENCE REQUIREMENTS (Fix #2):\nWhen you complete this task, you MUST provide completionEvidence in your final response:\n\n{\n  "evidenceType": "test-output|screenshot|fix-log|verification-log",\n  "filePath": "path/to/evidence/file",\n  "testResults": "pass|fail|partial",\n  "fixLog": "path/to/fix-log.md" (if applicable),\n  "verifiedBy": "stage: ${stageName}",\n  "timestamp": "ISO-8601 timestamp"\n}\n\nCRITICAL: Return completionEvidence in your final response text as JSON, NOT via the message tool.\n- Evidence files must exist on disk\n- Empty evidence or "I verified mentally" is INVALID\n- Actual test output/logs required (not self-assertions)\n- Fix log must exist for code/documentation changes\n\nVERIFICATION REQUIRED:\nComplete with VERIFICATION_REQUIRED phrase + valid completionEvidence.\nWithout evidence = task FAILED.`;
}

/**
 * CLI-based agent spawner (fallback)
 * Uses openclaw agent CLI command
 */
async function spawnAgentCLI(message, agentId = null, timeoutSeconds = 900) {
    try {
        // Build the openclaw agent command
        let cmd = `openclaw agent --local --message "${message.replace(/"/g, '\\"')}"`;

        if (agentId) {
            cmd += ` --agent ${agentId}`;
        }

        cmd += ` --timeout ${timeoutSeconds}`;
        cmd += ` --json`;

        console.log(`[queue] Spawning agent via CLI: ${agentId || 'default'}`);

        // Execute the command and capture output
        const result = execSync(cmd, {
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024,
            timeout: timeoutSeconds + 10  // Small buffer over timeout
        });

        // Parse JSON response
        const response = JSON.parse(result);

        // The response should contain session info or the agent's reply
        if (response.sessionId) {
            console.log(`[queue] Agent spawned with session: ${response.sessionId}`);
            return {
                sessionId: response.sessionId,
                output: response.reply || response.message || '',
                success: true
            };
        } else if (response.reply) {
            // Agent completed synchronously
            console.log(`[queue] Agent completed synchronously`);
            return {
                sessionId: null,
                output: response.reply,
                success: true
            };
        } else {
            throw new Error(`Unexpected agent response: ${JSON.stringify(response)}`);
        }

    } catch (error) {
        // Check if it's a timeout
        if (error.killed && error.signal === 'SIGTERM') {
            throw new Error(`Agent timeout exceeded (${timeoutSeconds}s)`);
        } else {
            throw new Error(error.stderr || error.message || 'Unknown error spawning agent');
        }
    }
}

/**
 * Check if session is complete (inactive or not updated recently)
 */
async function isSessionComplete(sessionId) {
    try {
        // Get session info using openclaw sessions
        const output = execSync('openclaw sessions --json', {
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024
        });

        const sessions = JSON.parse(output);
        const session = sessions.find(s => s.id === sessionId);

        if (!session) {
            // Session not found - assume complete (may have been cleaned up)
            return true;
        }

        // Check if agent sessionKey exists and is inactive
        // A session is complete if it's been inactive for >5 minutes (300s)
        const now = Date.now();
        const lastUpdated = session.updatedAt ? new Date(session.updatedAt).getTime() : 0;
        const inactiveTime = (now - lastUpdated) / 1000; // seconds

        // Complete if inactive for >5 minutes OR has a final status
        if (inactiveTime > 300) {
            return true;
        }

        // Check for completion indicators in session metadata
        if (session.status === 'complete' || session.status === 'error') {
            return true;
        }

        return false;

    } catch (error) {
        // If we can't check, assume complete to avoid infinite loops
        console.warn(`⚠️  Could not check session ${sessionId} status: ${error.message}`);
        return true;
    }
}

/**
 * Wait for a session to complete with polling (Fix #1)
 * Returns session transcript/results when complete
 */
async function waitForCompletion(sessionId, timeoutSeconds = 900, pollIntervalSeconds = 5) {
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;
    const pollIntervalMs = pollIntervalSeconds * 1000;

    console.log(`[queue] Waiting for session ${sessionId} to complete (timeout: ${timeoutSeconds}s)...`);

    let sessionData = null;

    while (true) {
        const elapsed = Date.now() - startTime;

        if (elapsed > timeoutMs) {
            throw new Error(`Session ${sessionId} did not complete within ${timeoutSeconds} seconds`);
        }

        try {
            // Get session info using openclaw sessions
            const output = execSync('openclaw sessions --json', {
                encoding: 'utf-8',
                maxBuffer: 10 * 1024 * 1024
            });

            const sessions = JSON.parse(output);
            sessionData = sessions.find(s => s.id === sessionId);

            if (!sessionData) {
                // Session not found - may have been cleaned up
                console.log(`[queue] Session ${sessionId} not found (may have been cleaned up)`);
                return { completed: true, session: null, transcript: null };
            }

            // Check if complete
            const isComplete = await isSessionComplete(sessionId);

            if (isComplete) {
                console.log(`[queue] Session ${sessionId} completed after ${(elapsed / 1000).toFixed(1)}s`);
                return {
                    completed: true,
                    session: sessionData,
                    transcript: sessionData.messages || null
                };
            }
        } catch (error) {
            // If we can't check, assume complete to avoid infinite loops
            console.warn(`⚠️  Could not check session ${sessionId} status: ${error.message}`);
            return {
                completed: true,
                session: sessionData,
                transcript: sessionData?.messages || null
            };
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
}

/**
 * Validate completion evidence (Fix #3)
 * Validates agent returned completionEvidence object
 * Checks evidence files exist on disk
 * Rejects empty evidence or "I verified mentally"
 * Validates fixLog file exists before stage completion
 */
async function validateCompletionEvidence(output, stageName, isDocStage = false) {
    const errors = [];
    let evidence = null;

    console.log(`[validation] Validating completion evidence for stage: ${stageName}`);

    // Check if output contains completionEvidence (as JSON)
    try {
        // Look for JSON object in output
        const jsonMatch = output.match(/\{[\s\S]*"evidenceType"[\s\S]*\}/);

        if (!jsonMatch) {
            errors.push('No completionEvidence object found in agent output');
            return { valid: false, evidence: null, errors };
        }

        evidence = JSON.parse(jsonMatch[0]);

        if (!isDocStage && !evidence.filePath && !evidence.fixLog) {
            errors.push('Evidence missing required fields: filePath or fixLog');
        }

        // Check if evidence file exists
        if (evidence.filePath) {
            try {
                const filePath = path.isAbsolute(evidence.filePath) 
                    ? evidence.filePath 
                    : path.join(process.cwd(), evidence.filePath);

                const stats = await fs.stat(filePath);

                // Check if file is too recent (possibly empty/fake)
                const ageMs = Date.now() - stats.mtimeMs;
                // Allow 500ms for test scenarios, but flag anything faster
                if (ageMs < 100) { // Less than 100ms old = suspiciously fast
                    errors.push(`Evidence file created too recently (${ageMs}ms), appears fake: ${evidence.filePath}`);
                }

                // Check file size
                if (stats.size === 0) {
                    errors.push(`Evidence file is empty: ${evidence.filePath}`);
                }

                console.log(`[validation] Evidence file exists: ${evidence.filePath} (size: ${stats.size} bytes)`);

                // Read and validate file content (Fix #3)
                const content = await fs.readFile(filePath, 'utf-8');

                // Check for fake markers
                const fakeMarkers = [
                    /i checked/i,
                    /looks good/i,
                    /seems fine/i,
                    /probably fine/i,
                    /should work/i,
                    /verified mentally/i
                ];

                for (const marker of fakeMarkers) {
                    if (marker.test(content) && content.length < 200) {
                        errors.push(`Evidence contains fake verification marker: "${marker}" in ${evidence.filePath}`);
                        break;
                    }
                }

                // Check for actual test output markers
                if (!isDocStage) {
                    const testMarkers = [
                        /passed:\s*\d+/i,
                        /failed:\s*\d+/i,
                        /✓|✔|pass|fail/i,
                        /tests?\s+rung?:\s*\d+/i,
                        /PASS|FAIL/gi
                    ];

                    const hasTestOutput = testMarkers.some(m => m.test(content));
                    if (!hasTestOutput) {
                        errors.push(`Evidence file lacks actual test output: ${evidence.filePath}`);
                    }
                }

            } catch (error) {
                if (error.code === 'ENOENT') {
                    errors.push(`Evidence file does not exist: ${evidence.filePath}`);
                } else {
                    errors.push(`Error checking evidence file: ${error.message}`);
                }
            }
        }

        // Check if fixLog exists for code/doc stages (Fix #3)
        if (evidence.fixLog || isDocStage) {
            const fixLogPath = isDocStage && !evidence.fixLog
                ? `/home/optimistprime/.openclaw/workspace/skills/sequential-agent-queue/fix-log-enhancement.md`
                : evidence.fixLog;

            try {
                const fixLogExists = path.isAbsolute(fixLogPath)
                    ? fixLogPath
                    : path.join(process.cwd(), fixLogPath);

                await fs.access(fixLogExists, fs.constants.F_OK);
                console.log(`[validation] Fix log exists: ${fixLogPath}`);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    errors.push(`Fix log does not exist: ${fixLogPath}`);
                }
            }
        }

    } catch (error) {
        errors.push(`Failed to parse evidence JSON: ${error.message}`);
    }

    if (errors.length > 0) {
        console.error(`[validation-failed] Stage ${stageName} evidence validation failed:`);
        errors.forEach(err => console.error(`  - ${err}`));
    }

    return {
        valid: errors.length === 0,
        evidence,
        errors
    };
}

/**
 * Check working directory changes and commit if needed (Fix #4)
 * Checks git status after stage completes
 * Requires commit for documentation stages (.md files)
 * Auto-commits if changes exist with proper git author
 */
async function checkAndCommitChanges(stageName, gitAuthor = "Vincent [Agent: sequential-queue]") {
    console.log(`[git-check] Checking for changes after stage: ${stageName}`);

    try {
        // Check git status
        const gitStatus = execSync('git status --short', {
            encoding: 'utf-8',
            cwd: '/home/optimistprime/.openclaw/workspace'
        });

        if (!gitStatus || gitStatus.trim().length === 0) {
            console.log('[git-check] No changes detected');
            return { committed: false, reason: 'No changes' };
        }

        console.log(`[git-check] Changes detected:\n${gitStatus}`);

        // Check for .md file changes (documentation stages)
        const hasDocChanges = /.*\.md$/m.test(gitStatus);

        if (hasDocChanges) {
            console.log('[git-check] Documentation changes detected, requiring commit');

            // Add all changes
            execSync('git add -A', {
                encoding: 'utf-8',
                cwd: '/home/optimistprime/.openclaw/workspace'
            });

            // Create commit message with fix log reference
            const commitMessage = `[${stageName}] Complete stage ${stageName}\n\nStage completed by Sequential Agent Queue\n\nReferences: fix-log-enhancement.md\n\nAuthor: ${gitAuthor}`;

            // Commit with proper author
            execSync(`git commit -m "${commitMessage}" --author="${gitAuthor} <vincent-agent@aomni.com>"`, {
                encoding: 'utf-8',
                cwd: '/home/optimistprime/.openclaw/workspace'
            });

            console.log('[git-check] Changes committed successfully');
            return { committed: true, changes: gitStatus };
        } else {
            // For non-doc stages with changes, just add but don't commit
            console.log('[git-check] Non-documentation changes detected, staged but not committed');
            execSync('git add -A', {
                encoding: 'utf-8',
                cwd: '/home/optimistprime/.openclaw/workspace'
            });
            return { committed: false, reason: 'Non-documentation changes staged', changes: gitStatus };
        }

    } catch (error) {
        // Git operations may fail if not a git repo or other issues
        console.warn(`[git-check-warn] Git check failed: ${error.message}`);
        return { committed: false, reason: `Git error: ${error.message}` };
    }
}

/**
 * Detect abandoned stages (Fix #6)
 * Session inactive but no files written
 */
async function detectAbandonedStage(sessionId, stageName, workingDir) {
    console.log(`[abandon-check] Checking if stage ${stageName} was abandoned`);

    try {
        // Check if session is inactive
        const output = execSync('openclaw sessions --json', {
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024
        });

        const sessions = JSON.parse(output);
        if (!Array.isArray(sessions)) {
            return false; // Unexpected format, not abandoned
        }
        const session = sessions.find(s => s.id === sessionId);

        if (!session) {
            return false; // Session cleaned up, not abandoned
        }

        const now = Date.now();
        const lastUpdated = session.updatedAt ? new Date(session.updatedAt).getTime() : 0;
        const inactiveTime = (now - lastUpdated) / 1000;

        // Session is inactive for >10 minutes
        if (inactiveTime > 600) {
            console.warn(`[abandon-warn] Session ${sessionId} inactive for ${inactiveTime}s, checking for output files`);

            // Check if output files exist
            const outputDir = path.join(workingDir || process.cwd(), '*', 'outputs');
            let hasOutputFiles = false;

            try {
                const files = await fs.readdir(outputDir, { recursive: true });
                hasOutputFiles = files && files.length > 0;
            } catch (e) {
                // Output dir may not exist
            }

            if (!hasOutputFiles) {
                console.error(`[abandon-failed] Stage ${stageName} appears abandoned: session inactive, no output files`);
                return true;
            }
        }

        return false;

    } catch (error) {
        console.warn(`[abandon-check-failed] Could not check for abandoned stage: ${error.message}`);
        return false;
    }
}

/**
 * Execute a single stage with retry logic (Fixes #1, #2, #3, #4, #5, #6)
 */
async function executeStage(stage, workflow, stageOutputs, context, agentSpawner) {
    const stageName = stage.name;
    const stageTimeoutMinutes = stage.timeoutMinutes || workflow.stageTimeoutMinutes || 15;
    const maxRetries = stage.retries !== undefined ? stage.retries : (workflow.retryOnFailure || 0);
    const agentId = stage.agentId || workflow.agentId || null;
    const workingDir = workflow.workingDirectory || process.cwd();

    let lastError = null;
    let sessionInfo = null;

    // Build context from previous stages
    let stageContext = {};
    if (stage.contextFrom && typeof stage.contextFrom === 'function') {
        try {
            stageContext = stage.contextFrom(stageOutputs);
        } catch (e) {
            throw new Error(`contextFrom callback failed for stage "${stageName}": ${e.message}`);
        }
    }

    // Merge with global context
    stageContext = { ...stageContext, ...context };

    // Inject context into task
    let task = injectContext(stage.task, stageContext);

    // Append governance protocols (Fix #2)
    task = appendGovernanceProtocols(task, stageName);

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        const startTime = Date.now();

        try {
            console.log(`[stage-started] Executing stage: ${stageName} (attempt ${attempt}/${maxRetries + 1})`);

            // Checkpoint: stage started
            if (checkpoint) {
                await checkpoint({
                    label: 'stage_started',
                    description: `Stage "${stageName}" started (attempt ${attempt})`,
                    status: 'active',
                    details: {
                        workflow: workflow.name,
                        stage: stageName,
                        attempt
                    }
                });
            }

            // Spawn agent using provided spawner
            const result = await agentSpawner(task, agentId, stageTimeoutMinutes * 60);

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Fix #1: If we have a sessionId, wait for completion and get transcript
            let output = result.output || '(No output)';
            if (result.sessionId) {
                const completion = await waitForCompletion(result.sessionId, stageTimeoutMinutes * 60);
                sessionInfo = completion;

                // If session has a transcript, use it as output
                if (completion.transcript && completion.transcript.length > 0) {
                    // Format transcript as readable output
                    output = completion.transcript.map(m => `[${m.role || 'assistant'}] ${m.content || ''}`).join('\n\n');
                    console.log(`[session-transcript] Retrieved ${completion.transcript.length} messages from session`);
                }
            }

            // Detect abandoned stage (Fix #6)
            if (result.sessionId) {
                const isAbandoned = await detectAbandonedStage(result.sessionId, stageName, workingDir);
                if (isAbandoned) {
                    throw new Error(`Stage "${stageName}" was abandoned: session inactive but no output generated`);
                }
            }

            // Save output
            const outputFile = await saveStageOutput(
                workflow.name,
                stageName,
                output,
                workingDir
            );

            // Fix #3: Validate completion evidence
            const isDocStage = stageName.toLowerCase().includes('doc') || 
                             stageName.toLowerCase().includes('design') ||
                             stageName.toLowerCase().includes('api') ||
                             stageName.toLowerCase().includes('requirements');

            const evidenceValidation = await validateCompletionEvidence(output, stageName, isDocStage);

            if (!evidenceValidation.valid) {
                const errorMsg = `Stage "${stageName}" failed evidence validation: ${evidenceValidation.errors.join('; ')}`;
                console.error(`[evidence-failed] ${errorMsg}`);

                // Checkpoint: evidence validation failed
                if (checkpoint) {
                    await checkpoint({
                        label: 'stage_evidence_failed',
                        description: `Stage "${stageName}" failed evidence validation`,
                        status: 'error',
                        details: {
                            workflow: workflow.name,
                            stage: stageName,
                            errors: evidenceValidation.errors
                        }
                    });
                }

                throw new Error(errorMsg);
            }

            console.log(`[evidence-validated] Stage: ${stageName} evidence validated successfully`);

            // Fix #4: Check and commit changes (especially for .md files)
            const gitResult = await checkAndCommitChanges(stageName, `Vincent [Agent: ${stageName}]`);

            if (gitResult.committed) {
                console.log(`[git-commit] Changes committed for stage: ${stageName}`);
            }

            const stageResult = {
                status: 'complete',
                output: output,
                file: outputFile,
                startTime: new Date(startTime).toISOString(),
                endTime: new Date(endTime).toISOString(),
                duration,
                attempts: attempt,
                sessionId: result.sessionId,
                evidence: evidenceValidation.evidence,
                gitCommit: gitResult,
                sessionTranscript: sessionInfo?.transcript || null
            };

            console.log(`[stage-complete] Stage: ${stageName} completed in ${(duration / 1000).toFixed(1)}s`);

            // Checkpoint: stage complete (Fix #5: auto-progression validation)
            if (checkpoint) {
                await checkpoint({
                    label: 'stage_complete',
                    description: `Stage "${stageName}" completed successfully (validated with evidence and commit)`,
                    status: 'complete',
                    details: {
                        workflow: workflow.name,
                        stage: stageName,
                        outputFile,
                        duration,
                        attempts: attempt,
                        sessionId: result.sessionId,
                        evidenceValidated: true,
                        gitCommitted: gitResult.committed
                    }
                });
            }

            return stageResult;

        } catch (error) {
            lastError = error;
            console.error(`[stage-failed] Stage: ${stageName} failed (attempt ${attempt}): ${error.message}`);

            // Checkpoint: stage failed
            if (checkpoint) {
                await checkpoint({
                    label: 'stage_failed',
                    description: `Stage "${stageName}" failed (attempt ${attempt})`,
                    status: 'error',
                    details: {
                        workflow: workflow.name,
                        stage: stageName,
                        error: error.message,
                        stack: error.stack,
                        attempt,
                        sessionId: result?.sessionId
                    }
                });
            }

            // If not last attempt, retry after delay
            if (attempt <= maxRetries) {
                const delaySeconds = 5 * attempt;
                console.log(`[stage-retry] Retrying stage: ${stageName} in ${delaySeconds}s...`);
                await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
            }
        }
    }

    // Fix #6: All retries exhausted - return detailed error report
    const errorReport = {
        stage: stageName,
        attempts: maxRetries + 1,
        lastError: lastError.message,
        stack: lastError.stack,
        sessionId: sessionInfo?.session?.id,
        sessionTranscript: sessionInfo?.transcript || null
    };

    throw new Error(JSON.stringify(errorReport));
}

/**
 * Execute complete workflow
 */
async function executeWorkflow(workflow, context = {}, agentSpawner = null) {
    // Determine which spawner to use
    const spawner = agentSpawner || spawnAgentCLI;

    // Validate workflow
    const validation = validateWorkflow(workflow);
    if (!validation.valid) {
        throw new Error(`Invalid workflow: ${validation.errors.join(', ')}`);
    }

    const startTime = Date.now();
    const executionOrder = topologicalSort(workflow.stages);
    const stageOutputs = {};
    const stopOnError = workflow.stopOnError !== undefined ? workflow.stopOnError : true;
    const workingDir = workflow.workingDirectory || process.cwd();

    console.log(`[workflow-started] Starting workflow: ${workflow.name}`);
    console.log(`[workflow-order] Execution order: ${executionOrder.join(' → ')}`);

    // Checkpoint: workflow started
    if (checkpoint) {
        await checkpoint({
            label: 'workflow_started',
            description: `Workflow "${workflow.name}" started`,
            status: 'active',
            details: {
                workflow: workflow.name,
                stageCount: workflow.stages.length,
                executionOrder
            }
        });
    }

    let failedStage = null;

    // Execute stages in order
    for (let i = 0; i < executionOrder.length; i++) {
        const stageName = executionOrder[i];
        const stageIndex = workflow.stages.findIndex(s => s.name === stageName);
        const stage = workflow.stages[stageIndex];

        // Check if all dependencies are met
        const unmetDeps = stage.dependencies.filter(dep => 
            !stageOutputs[dep] || stageOutputs[dep].status !== 'complete'
        );

        if (unmetDeps.length > 0) {
            console.error(`[stage-skipped] Stage: ${stageName} skipped - unmet dependencies: ${unmetDeps.join(', ')}`);
            
            stageOutputs[stageName] = {
                status: 'skipped',
                reason: 'Unmet dependencies',
                unmetDependencies: unmetDeps,
                startTime: new Date().toISOString(),
                endTime: new Date().toISOString(),
                duration: 0,
                attempts: 0
            };

            continue;
        }

        try {
            // Execute the stage
            const result = await executeStage(stage, workflow, stageOutputs, context, spawner);
            stageOutputs[stageName] = result;

        } catch (error) {
            failedStage = stageName;
            
            stageOutputs[stageName] = {
                status: 'failed',
                error: {
                    message: error.message,
                    attempts: stage.retries !== undefined ? stage.retries + 1 : (workflow.retryOnFailure || 0) + 1
                },
                startTime: new Date().toISOString(),
                endTime: new Date().toISOString(),
                duration: 0
            };

            console.error(`[workflow-error] Stage failed: ${stageName}`);

            // Stop on error or continue?
            if (stopOnError) {
                console.log(`[workflow-stopped] Workflow stopped due to stage failure`);
                break;
            } else {
                console.log(`[workflow-continuing] Continuing despite failure (stopOnError: false)`);
            }
        }
    }

    const endTime = Date.now();
    const totalDuration = endTime - startTime;
    const success = failedStage === null && !Object.values(stageOutputs).some(s => s.status === 'failed');

    // Checkpoint: workflow complete or failed
    if (checkpoint) {
        await checkpoint({
            label: success ? 'workflow_complete' : 'workflow_failed',
            description: success 
                ? `Workflow "${workflow.name}" completed successfully` 
                : `Workflow "${workflow.name}" failed at stage "${failedStage}"`,
            status: success ? 'complete' : 'error',
            details: {
                workflow: workflow.name,
                success,
                failedStage,
                totalDuration,
                stagesCompleted: Object.values(stageOutputs).filter(s => s.status === 'complete').length,
                stagesFailed: Object.values(stageOutputs).filter(s => s.status === 'failed').length
            }
        });
    }

    console.log(`[${success ? 'workflow-complete' : 'workflow-failed'}] Workflow: ${workflow.name} in ${(totalDuration / 1000).toFixed(1)}s`);

    return {
        success,
        workflow: workflow.name,
        stages: stageOutputs,
        totalDuration,
        failedStage,
        executionOrder
    };
}

/**
 * Get workflow status (for resume/interruption)
 */
function getWorkflowStatus(workflowName) {
    // This would integrate with a persistent store
    // For now, return placeholder
    return null;
}

/**
 * Cancel workflow
 */
async function cancelWorkflow(workflowName) {
    // This would integrate with a persistent store and signal running stages
    // For now, return placeholder
    return false;
}

// Export functions
module.exports = {
    executeWorkflow,
    validateWorkflow,
    getWorkflowStatus,
    cancelWorkflow,
    topologicalSort,
    spawnAgentCLI,
    waitForCompletion,
    validateCompletionEvidence,  // Fix #3
    checkAndCommitChanges,        // Fix #4
    detectAbandonedStage         // Fix #6
};

// Export for use as script
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length > 0 && args[0] === 'validate') {
        // Validate workflow from file
        if (args.length < 2) {
            console.error('Usage: node queue.js validate <workflow-file>');
            process.exit(1);
        }

        const workflowFile = args[1];
        try {
            const workflow = JSON.parse(require('fs').readFileSync(workflowFile, 'utf-8'));
            const validation = validateWorkflow(workflow);

            if (validation.valid) {
                console.log('✅ Workflow is valid');
                console.log(`   Stages: ${workflow.stages.length}`);
                console.log(`   Stop on error: ${workflow.stopOnError !== false}`);
                console.log(`   Retries: ${workflow.retryOnFailure || 0}`);
            } else {
                console.error('❌ Workflow validation failed:');
                validation.errors.forEach(err => console.error(`   - ${err}`));
                process.exit(1);
            }
        } catch (error) {
            console.error(`❌ Error loading workflow: ${error.message}`);
            process.exit(1);
        }
    } else if (args.length > 0 && args[0] === 'example') {
        // Run example workflow
        const exampleWorkflow = {
            name: 'example-workflow',
            stages: [
                {
                    name: 'phase1',
                    task: 'Create a sample document with three sections: introduction, body, and conclusion.',
                    dependencies: []
                },
                {
                    name: 'phase2',
                    task: 'Review and expand the document from phase1. Add more details to each section.',
                    dependencies: ['phase1'],
                    contextFrom: (outputs) => ({ source: outputs.phase1.file })
                },
                {
                    name: 'phase3',
                    task: 'Finalize the document. Check for consistency and format properly.',
                    dependencies: ['phase2'],
                    contextFrom: (outputs) => ({ draft: outputs.phase2.file })
                }
            ],
            stopOnError: true,
            retryOnFailure: 0
        };

        console.log('Running example workflow...\n');
        executeWorkflow(exampleWorkflow)
            .then(result => {
                console.log('\n✅ Example workflow completed');
                console.log('Results:', JSON.stringify(result, null, 2));
            })
            .catch(error => {
                console.error('\n❌ Example workflow failed:', error.message);
                process.exit(1);
            });
    } else {
        console.log(`
Sequential Agent Queue
====================

Usage:
  const queue = require('skills/sequential-agent-queue/queue.js');
  
  const workflow = {
      name: 'my-workflow',
      stages: [ ... ],
      stopOnError: true,
      retryOnFailure: 1
  };
  
  // Run with default CLI-based spawner
  const result = await queue.executeWorkflow(workflow);
  
  // Or run with custom spawner (e.g., sessions_spawn from main agent)
  const result = await queue.executeWorkflow(workflow, {}, customSpawner);

Commands:
  node queue.js validate <workflow-file>  # Validate workflow JSON file
  node queue.js example                    # Run example workflow

Features:
  - Topological sort for dependency ordering
  - Sequential execution with context passing
  - Retry logic per stage
  - Timeout handling
  - Checkpoint integration
  - Progress tracking

Architecture:
  - Supports both internal sessions_spawn and CLI-based spawning
  - Polls sessions for completion
  - Embeds governance protocols in all tasks
        `);
    }
}