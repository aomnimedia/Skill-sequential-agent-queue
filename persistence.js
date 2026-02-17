/**
 * Workflow Persistence and Resumption for Sequential Agent Queue
 *
 * Provides persistent storage for workflow state, enabling pause/resume
 * functionality and recovery from interruptions.
 *
 * @author Vincent [Agent: CODER]
 * @version 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Configuration
 */
const CONFIG = {
    // Workflow state storage directory
    stateDirectory: './workflow-states',

    // State retention (delete states older than N days)
    stateRetentionDays: 7,

    // Auto-save after each stage completion
    autoSave: true,

    // Enable state compression (for large workflows)
    compressState: true
};

/**
 * Workflow state schema
 */
class WorkflowState {
    constructor(options = {}) {
        this.workflowId = options.workflowId || this.generateId();
        this.workflowName = options.workflowName || '';
        this.startedAt = options.startedAt || new Date().toISOString();
        this.lastUpdated = options.lastUpdated || new Date().toISOString();
        this.status = options.status || 'running'; // running, paused, completed, failed, cancelled
        this.iteration = options.iteration || 0;
        this.maxIterations = options.maxIterations || 3;
        this.completedStages = options.completedStages || [];
        this.failedStage = options.failedStage || null;
        this.pausedStage = options.pausedStage || null;
        this.stageOutputs = options.stageOutputs || {};
        this.context = options.context || {};
        this.executionOrder = options.executionOrder || [];
        this.errorMessage = options.errorMessage || null;
        this.metadata = options.metadata || {};
    }

    /**
     * Generate unique workflow ID
     */
    generateId() {
        return `wf-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    }

    /**
     * Convert to JSON-safe object
     */
    toJSON() {
        return {
            workflowId: this.workflowId,
            workflowName: this.workflowName,
            startedAt: this.startedAt,
            lastUpdated: this.lastUpdated,
            status: this.status,
            iteration: this.iteration,
            maxIterations: this.maxIterations,
            completedStages: this.completedStages,
            failedStage: this.failedStage,
            pausedStage: this.pausedStage,
            stageOutputs: this.stageOutputs,
            context: this.context,
            executionOrder: this.executionOrder,
            errorMessage: this.errorMessage,
            metadata: this.metadata
        };
    }

    /**
     * Create WorkflowState from JSON object
     */
    static fromJSON(json) {
        const state = new WorkflowState(json);
        return state;
    }
}

/**
 * Initialize state directory
 *
 * @returns {Promise<void>}
 */
async function initializeStateDirectory() {
    try {
        await fs.mkdir(CONFIG.stateDirectory, { recursive: true });
        console.log(`[persistence] State directory initialized: ${CONFIG.stateDirectory}`);
    } catch (error) {
        console.error(`[persistence-error] Could not initialize state directory: ${error.message}`);
        throw error;
    }
}

/**
 * Get state file path for workflow
 *
 * @param {string} workflowId - Workflow ID
 * @returns {string} State file path
 */
function getStateFilePath(workflowId) {
    return path.join(CONFIG.stateDirectory, `${workflowId}.json`);
}

/**
 * Save workflow state to disk
 *
 * @param {WorkflowState} state - Workflow state to save
 * @returns {Promise<string>} Path to saved state file
 */
async function saveWorkflowState(state) {
    try {
        await initializeStateDirectory();

        const stateFilePath = getStateFilePath(state.workflowId);
        const stateJSON = state.toJSON();
        state.lastUpdated = new Date().toISOString();

        await fs.writeFile(
            stateFilePath,
            JSON.stringify(stateJSON, null, 2),
            'utf-8'
        );

        console.log(`[persistence] State saved: ${state.workflowId} (${state.status})`);
        return stateFilePath;
    } catch (error) {
        console.error(`[persistence-error] Could not save state: ${error.message}`);
        throw error;
    }
}

/**
 * Load workflow state from disk
 *
 * @param {string} workflowId - Workflow ID
 * @returns {Promise<WorkflowState|null>} Workflow state or null if not found
 */
async function loadWorkflowState(workflowId) {
    try {
        const stateFilePath = getStateFilePath(workflowId);
        const stateContent = await fs.readFile(stateFilePath, 'utf-8');
        const stateJSON = JSON.parse(stateContent);

        const state = WorkflowState.fromJSON(stateJSON);

        console.log(`[persistence] State loaded: ${state.workflowId} (${state.status})`);
        console.log(`[persistence] Completed stages: ${state.completedStages.length}/${state.executionOrder.length}`);
        console.log(`[persistence] Started: ${state.startedAt}`);
        console.log(`[persistence] Last updated: ${state.lastUpdated}`);

        return state;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`[persistence] State not found: ${workflowId}`);
            return null;
        }
        console.error(`[persistence-error] Could not load state: ${error.message}`);
        throw error;
    }
}

/**
 * Delete workflow state file
 *
 * @param {string} workflowId - Workflow ID
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
async function deleteWorkflowState(workflowId) {
    try {
        const stateFilePath = getStateFilePath(workflowId);
        await fs.unlink(stateFilePath);

        console.log(`[persistence] State deleted: ${workflowId}`);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`[persistence] State not found for deletion: ${workflowId}`);
            return false;
        }
        console.error(`[persistence-error] Could not delete state: ${error.message}`);
        throw error;
    }
}

/**
 * List all workflow states
 *
 * @returns {Promise<Array>} Array of workflow state metadata
 */
async function listWorkflowStates() {
    try {
        await initializeStateDirectory();

        const entries = await fs.readdir(CONFIG.stateDirectory);
        const states = [];

        for (const entry of entries) {
            if (!entry.endsWith('.json')) continue;

            try {
                const stateFilePath = path.join(CONFIG.stateDirectory, entry);
                const stateContent = await fs.readFile(stateFilePath, 'utf-8');
                const stateJSON = JSON.parse(stateContent);

                states.push({
                    workflowId: stateJSON.workflowId,
                    workflowName: stateJSON.workflowName,
                    status: stateJSON.status,
                    startedAt: stateJSON.startedAt,
                    lastUpdated: stateJSON.lastUpdated,
                    progress: {
                        completedStages: stateJSON.completedStages.length,
                        totalStages: stateJSON.executionOrder.length,
                        percent: stateJSON.executionOrder.length > 0
                            ? Math.round((stateJSON.completedStages.length / stateJSON.executionOrder.length) * 100)
                            : 0
                    }
                });
            } catch (error) {
                console.warn(`[persistence-warn] Could not read state file: ${entry}`);
            }
        }

        // Sort by last updated (newest first)
        states.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));

        return states;
    } catch (error) {
        console.error(`[persistence-error] Could not list states: ${error.message}`);
        return [];
    }
}

/**
 * Get workflow status by ID
 *
 * @param {string} workflowId - Workflow ID
 * @returns {Promise<Object|null>} Workflow status or null if not found
 */
async function getWorkflowStatus(workflowId) {
    const state = await loadWorkflowState(workflowId);

    if (!state) {
        return null;
    }

    return {
        workflowId: state.workflowId,
        workflowName: state.workflowName,
        status: state.status,
        startedAt: state.startedAt,
        lastUpdated: state.lastUpdated,
        iteration: state.iteration,
        progress: {
            completedStages: state.completedStages,
            totalStages: state.executionOrder.length,
            percent: state.executionOrder.length > 0
                ? Math.round((state.completedStages.length / state.executionOrder.length) * 100)
                : 0
        },
        failedStage: state.failedStage,
        pausedStage: state.pausedStage,
        errorMessage: state.errorMessage
    };
}

/**
 * Resume workflow from saved state
 *
 * @param {string} workflowId - Workflow ID
 * @param {Object} workflow - Original workflow definition
 * @returns {Promise<Object>} Resumed workflow state with context
 */
async function resumeWorkflow(workflowId, workflow) {
    console.log(`[persistence] Resuming workflow: ${workflowId}`);

    const state = await loadWorkflowState(workflowId);

    if (!state) {
        throw new Error(`Workflow state not found: ${workflowId}`);
    }

    if (state.status === 'completed') {
        throw new Error(`Workflow is already completed: ${workflowId}`);
    }

    if (state.status === 'cancelled') {
        throw new Error(`Workflow was cancelled: ${workflowId}`);
    }

    // Verify workflow name matches (basic security check)
    if (state.workflowName !== workflow.name) {
        console.warn(`[persistence-warn] Workflow name mismatch: state="${state.workflowName}", provided="${workflow.name}"`);
    }

    // Resume from paused stage or last completed stage
    let resumeFromStage = null;

    if (state.pausedStage) {
        resumeFromStage = state.pausedStage;
    } else if (state.failedStage) {
        // Resume from failed stage
        resumeFromStage = state.failedStage;
    } else if (state.completedStages.length > 0) {
        // Resume from next uncompleted stage
        const lastCompleted = state.completedStages[state.completedStages.length - 1];
        const lastCompletedIndex = state.executionOrder.indexOf(lastCompleted);

        if (lastCompletedIndex < state.executionOrder.length - 1) {
            resumeFromStage = state.executionOrder[lastCompletedIndex + 1];
        }
    }

    // Update state to running
    state.status = 'running';
    state.pausedStage = null;
    state.failedStage = null;
    state.errorMessage = null;

    await saveWorkflowState(state);

    console.log(`[persistence] Resume from stage: ${resumeFromStage || 'beginning'}`);
    console.log(`[persistence] Skipping ${state.completedStages.length} already completed stages`);

    return {
        state,
        context: state.context,
        resumeFromStage,
        stageOutputs: state.stageOutputs
    };
}

/**
 * Cancel running workflow
 *
 * @param {string} workflowId - Workflow ID
 * @returns {Promise<boolean>} True if cancelled, false if not found
 */
async function cancelWorkflow(workflowId) {
    console.log(`[persistence] Cancelling workflow: ${workflowId}`);

    const state = await loadWorkflowState(workflowId);

    if (!state) {
        console.warn(`[persistence] Workflow not found for cancellation: ${workflowId}`);
        return false;
    }

    if (state.status === 'completed') {
        console.warn(`[persistence] Cannot cancel completed workflow: ${workflowId}`);
        return false;
    }

    if (state.status === 'cancelled') {
        console.log(`[persistence] Workflow already cancelled: ${workflowId}`);
        return true;
    }

    // Mark as cancelled
    state.status = 'cancelled';
    state.lastUpdated = new Date().toISOString();

    await saveWorkflowState(state);

    console.log(`[persistence] Workflow cancelled: ${workflowId}`);
    return true;
}

/**
 * Update stage completion in state
 *
 * @param {string} workflowId - Workflow ID
 * @param {string} stageName - Stage name
 * @param {Object} stageResult - Stage execution result
 * @returns {Promise<void>}
 */
async function updateStageCompletion(workflowId, stageName, stageResult) {
    const state = await loadWorkflowState(workflowId);

    if (!state) {
        console.warn(`[persistence] Workflow state not found: ${workflowId}`);
        return;
    }

    // Update completed stages
    if (!state.completedStages.includes(stageName)) {
        state.completedStages.push(stageName);
    }

    // Clear failed/paused stage if this was the one
    if (state.failedStage === stageName) {
        state.failedStage = null;
    }
    if (state.pausedStage === stageName) {
        state.pausedStage = null;
    }

    // Store stage output
    state.stageOutputs[stageName] = stageResult;

    state.lastUpdated = new Date().toISOString();
    state.errorMessage = null;

    await saveWorkflowState(state);
}

/**
 * Update stage failure in state
 *
 * @param {string} workflowId - Workflow ID
 * @param {string} stageName - Stage name
 * @param {Error} error - Error that occurred
 * @returns {Promise<void>}
 */
async function updateStageFailure(workflowId, stageName, error) {
    const state = await loadWorkflowState(workflowId);

    if (!state) {
        console.warn(`[persistence] Workflow state not found: ${workflowId}`);
        return;
    }

    // Record failed stage
    state.failedStage = stageName;
    state.errorMessage = error.message;
    state.lastUpdated = new Date().toISOString();

    // If workflow is being paused on error, set status to failed
    state.status = 'failed';

    await saveWorkflowState(state);
}

/**
 * Mark workflow as completed
 *
 * @param {string} workflowId - Workflow ID
 * @returns {Promise<void>}
 */
async function markWorkflowCompleted(workflowId) {
    const state = await loadWorkflowState(workflowId);

    if (!state) {
        console.warn(`[persistence] Workflow state not found: ${workflowId}`);
        return;
    }

    state.status = 'completed';
    state.lastUpdated = new Date().toISOString();
    state.failedStage = null;
    state.pausedStage = null;
    state.errorMessage = null;

    await saveWorkflowState(state);
}

/**
 * Clean up old workflow states
 *
 * @param {number} retentionDays - Days to retain states (default from CONFIG)
 * @returns {Promise<Object>} Cleanup statistics
 */
async function cleanupOldStates(retentionDays = CONFIG.stateRetentionDays) {
    console.log(`[persistence] Cleaning up old workflow states (> ${retentionDays} days old)`);

    const stats = {
        totalStates: 0,
        deletedStates: 0,
        bytesFreed: 0
    };

    try {
        await initializeStateDirectory();
        const entries = await fs.readdir(CONFIG.stateDirectory);

        const now = Date.now();
        const retentionMs = retentionDays * 24 * 60 * 60 * 1000;

        for (const entry of entries) {
            if (!entry.endsWith('.json')) continue;

            stats.totalStates++;

            try {
                const filePath = path.join(CONFIG.stateDirectory, entry);
                const fileStats = await fs.stat(filePath);
                const fileAge = now - fileStats.mtimeMs;

                if (fileAge > retentionMs) {
                    await fs.unlink(filePath);
                    stats.deletedStates++;
                    stats.bytesFreed += fileStats.size;

                    console.log(`[persistence] Deleted old state: ${entry}`);
                }
            } catch (error) {
                console.warn(`[persistence-warn] Could not delete state ${entry}: ${error.message}`);
            }
        }

        console.log(`[persistence] Cleanup complete: ${stats.deletedStates}/${stats.totalStates} states deleted`);
        return stats;

    } catch (error) {
        console.error(`[persistence-error] Cleanup failed: ${error.message}`);
        return stats;
    }
}

module.exports = {
    CONFIG,
    WorkflowState,
    initializeStateDirectory,
    saveWorkflowState,
    loadWorkflowState,
    deleteWorkflowState,
    listWorkflowStates,
    getWorkflowStatus,
    resumeWorkflow,
    cancelWorkflow,
    updateStageCompletion,
    updateStageFailure,
    markWorkflowCompleted,
    cleanupOldStates
};