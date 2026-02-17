/**
 * Enhanced Error Recovery for Sequential Agent Queue
 *
 * Provides intelligent error classification and recovery strategies
 * for workflow execution failures.
 *
 * @author Vincent [Agent: CODER]
 * @version 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Error classification
 */
const ERROR_TYPES = {
    TIMEOUT: 'timeout',
    RESOURCE_EXHAUSTED: 'resource_exhausted',
    INVALID_INPUT: 'invalid_input',
    NETWORK_ERROR: 'network_error',
    AGENT_SPAWN_FAILED: 'agent_spawn_failed',
    VALIDATION_FAILED: 'validation_failed',
    ABANDONED_STAGE: 'abandoned_stage',
    UNKNOWN: 'unknown'
};

/**
 * Retryable vs non-retryable errors
 */
const RETRYABILITY = {
    [ERROR_TYPES.TIMEOUT]: true,
    [ERROR_TYPES.RESOURCE_EXHAUSTED]: true,
    [ERROR_TYPES.NETWORK_ERROR]: true,
    [ERROR_TYPES.AGENT_SPAWN_FAILED]: true,
    [ERROR_TYPES.INVALID_INPUT]: false,
    [ERROR_TYPES.VALIDATION_FAILED]: false,
    [ERROR_TYPES.ABANDONED_STAGE]: false,
    [ERROR_TYPES.UNKNOWN]: false
};

/**
 * Recovery strategies per error type
 */
const RECOVERY_STRATEGIES = {
    [ERROR_TYPES.TIMEOUT]: {
        strategy: 'extend_timeout',
        description: 'Extend timeout and retry',
        action: async (error, context) => {
            const newTimeout = context.currentTimeout * 1.5;
            console.log(`[recovery] Extending timeout from ${context.currentTimeout}s to ${newTimeout}s`);
            return { extendTimeout: newTimeout };
        }
    },
    [ERROR_TYPES.RESOURCE_EXHAUSTED]: {
        strategy: 'cleanup_and_retry',
        description: 'Cleanup resources and retry',
        action: async (error, context) => {
            console.log(`[recovery] Cleaning up resources before retry...`);
            // Would trigger cleanup in resource-manager
            return { cleanup: true };
        }
    },
    [ERROR_TYPES.NETWORK_ERROR]: {
        strategy: 'exponential_backoff',
        description: 'Retry with exponential backoff',
        action: async (error, context) => {
            const delayMs = Math.min(1000 * Math.pow(2, context.attempt - 1), 30000);
            console.log(`[recovery] Backing off ${delayMs}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            return { backoff: delayMs };
        }
    },
    [ERROR_TYPES.AGENT_SPAWN_FAILED]: {
        strategy: 'fallback_spawn',
        description: 'Try fallback agent spawner',
        action: async (error, context) => {
            console.log(`[recovery] Trying fallback spawner...`);
            return { useFallback: true };
        }
    }
};

/**
 * Classify error type from error message
 *
 * @param {Error} error - The error to classify
 * @returns {Object} Classification result with type and metadata
 */
function classifyError(error) {
    const message = error.message || '';
    const stack = error.stack || '';

    // Timeout errors
    if (/timeout|exceeded|time limit/i.test(message)) {
        return {
            type: ERROR_TYPES.TIMEOUT,
            retryable: RETRYABILITY[ERROR_TYPES.TIMEOUT],
            metadata: {
                message: error.message,
                suggestion: 'Consider increasing stageTimeoutMinutes in workflow configuration'
            }
        };
    }

    // Resource exhaustion
    if (/memory|disk|space|resource|exhausted|heap/i.test(message)) {
        return {
            type: ERROR_TYPES.RESOURCE_EXHAUSTED,
            retryable: RETRYABILITY[ERROR_TYPES.RESOURCE_EXHAUSTED],
            metadata: {
                message: error.message,
                suggestion: 'Check system resources and consider reducing workflow complexity'
            }
        };
    }

    // Invalid input errors
    if (/invalid|validation|format|schema|parse|syntax/i.test(message)) {
        return {
            type: ERROR_TYPES.INVALID_INPUT,
            retryable: RETRYABILITY[ERROR_TYPES.INVALID_INPUT],
            metadata: {
                message: error.message,
                suggestion: 'Review workflow configuration and stage definitions for errors'
            }
        };
    }

    // Network errors
    if (/network|connection|fetch|request|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(message)) {
        return {
            type: ERROR_TYPES.NETWORK_ERROR,
            retryable: RETRYABILITY[ERROR_TYPES.NETWORK_ERROR],
            metadata: {
                message: error.message,
                suggestion: 'Check network connectivity and retry'
            }
        };
    }

    // Agent spawn failures
    if (/spawn|agent|session/i.test(message)) {
        return {
            type: ERROR_TYPES.AGENT_SPAWN_FAILED,
            retryable: RETRYABILITY[ERROR_TYPES.AGENT_SPAWN_FAILED],
            metadata: {
                message: error.message,
                suggestion: 'Check OpenClaw Gateway status and try fallback spawner'
            }
        };
    }

    // Validation failures
    if (/evidence|validation|proof|verify/i.test(message)) {
        return {
            type: ERROR_TYPES.VALIDATION_FAILED,
            retryable: RETRYABILITY[ERROR_TYPES.VALIDATION_FAILED],
            metadata: {
                message: error.message,
                suggestion: 'Review agent output for proper evidence and verification'
            }
        };
    }

    // Abandoned stage
    if (/abandoned/i.test(message)) {
        return {
            type: ERROR_TYPES.ABANDONED_STAGE,
            retryable: RETRYABILITY[ERROR_TYPES.ABANDONED_STAGE],
            metadata: {
                message: error.message,
                suggestion: 'Agent failed without producing output - may require manual review'
            }
        };
    }

    // Unknown error
    return {
        type: ERROR_TYPES.UNKNOWN,
        retryable: RETRYABILITY[ERROR_TYPES.UNKNOWN],
        metadata: {
            message: error.message,
            stack: error.stack,
            suggestion: 'Review error details and logs for more information'
        }
    };
}

/**
 * Attempt recovery based on error type and context
 *
 * @param {Object} classification - Error classification result
 * @param {Object} context - Recovery context (attempt, currentTimeout, etc.)
 * @returns {Object} Recovery action result
 */
async function attemptRecovery(classification, context) {
    const { type, metadata } = classification;
    const strategy = RECOVERY_STRATEGIES[type];

    if (!strategy) {
        console.log(`[recovery] No recovery strategy available for error type: ${type}`);
        return null;
    }

    console.log(`[recovery] Attempting recovery using: ${strategy.strategy}`);
    console.log(`[recovery] Description: ${strategy.description}`);

    try {
        const result = await strategy.action({ ...metadata }, context);

        console.log(`[recovery] Recovery action completed:`, result);
        return {
            success: true,
            strategy: strategy.strategy,
            result
        };
    } catch (error) {
        console.error(`[recovery-failed] Recovery action failed: ${error.message}`);
        return {
            success: false,
            strategy: strategy.strategy,
            error: error.message
        };
    }
}

/**
 * Decide whether to retry or halt based on error and context
 *
 * @param {Object} classification - Error classification
 * @param {Object} context - Error context (attempt, maxRetries)
 * @returns {Object} Decision with action and reason
 */
function decideRecoveryAction(classification, context) {
    const { retryable } = classification;
    const { attempt, maxRetries } = context;

    // If error is not retryable, halt
    if (!retryable) {
        return {
            action: 'halt',
            reason: `${classification.type} is not retryable`,
            suggestion: classification.metadata.suggestion
        };
    }

    // If max retries exhausted, halt
    if (attempt >= maxRetries + 1) {
        return {
            action: 'halt',
            reason: 'Maximum retry attempts exhausted',
            suggestion: 'Review error logs and consider increasing retryOnFailure in workflow configuration'
        };
    }

    // Otherwise, retry
    return {
        action: 'retry',
        reason: `${classification.type} is retryable, attempting recovery`,
        suggestion: classification.metadata.suggestion
    };
}

/**
 * Log error details to file for debugging
 *
 * @param {Object} errorInfo - Complete error information
 * @param {string} logPath - Path to error log directory
 */
async function logError(errorInfo, logPath = './error-logs') {
    try {
        await fs.mkdir(logPath, { recursive: true });

        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
        const filename = `error-${errorInfo.workflow}-${errorInfo.stage}-${timestamp}.json`;
        const filepath = path.join(logPath, filename);

        const logContent = {
            timestamp: new Date().toISOString(),
            workflow: errorInfo.workflow,
            stage: errorInfo.stage,
            attempt: errorInfo.attempt,
            classification: errorInfo.classification,
            recoveryAttempted: errorInfo.recoveryAttempted,
            recoveryResult: errorInfo.recoveryResult,
            finalDecision: errorInfo.finalDecision,
            stackTrace: errorInfo.stackTrace,
            additionalContext: errorInfo.additionalContext || {}
        };

        await fs.writeFile(filepath, JSON.stringify(logContent, null, 2), 'utf-8');
        console.log(`[error-logged] Error details saved to: ${filepath}`);

        return filepath;
    } catch (err) {
        console.error(`[error-log-failed] Could not save error log: ${err.message}`);
        return null;
    }
}

/**
 * Handle workflow error with full recovery logic
 *
 * @param {Error} error - The error that occurred
 * @param {Object} context - Error and recovery context
 * @returns {Object} Error handling result
 */
async function handleWorkflowError(error, context) {
    const {
        workflowName,
        stageName,
        attempt,
        maxRetries,
        currentTimeout,
        stackTrace
    } = context;

    console.log(`\n[error-handling] Handling error for stage: ${stageName}`);
    console.log(`[error-handling] Attempt: ${attempt}/${maxRetries + 1}`);
    console.log(`[error-handling] Error message: ${error.message}\n`);

    // Step 1: Classify the error
    const classification = classifyError(error);
    console.log(`[classification] Type: ${classification.type}`);
    console.log(`[classification] Retryable: ${classification.retryable}`);

    // Step 2: Determine recovery action
    const decision = decideRecoveryAction(classification, context);
    console.log(`[decision] Action: ${decision.action}`);
    console.log(`[decision] Reason: ${decision.reason}`);
    console.log(`[decision] Suggestion: ${decision.suggestion}`);

    // Step 3: Attempt recovery if applicable
    let recoveryAttempted = {
        attempted: false,
        success: false,
        strategy: null,
        result: null
    };

    if (decision.action === 'retry' && classification.retryable) {
        console.log(`[recovery-attempt] Attempting recovery...`);
        const recoveryResult = await attemptRecovery(classification, {
            attempt,
            currentTimeout
        });

        recoveryAttempted = {
            attempted: true,
            success: recoveryResult?.success || false,
            strategy: recoveryResult?.strategy || null,
            result: recoveryResult?.result || recoveryResult
        };

        console.log(`[recovery-complete] Success: ${recoveryAttempted.success}`);
        if (recoveryAttempted.result) {
            console.log(`[recovery-result]`, recoveryAttempted.result);
        }
    } else {
        console.log(`[recovery-skipped] Not attempting recovery`);
    }

    // Step 4: Log error details
    const errorInfo = {
        workflow: workflowName,
        stage: stageName,
        attempt,
        classification,
        recoveryAttempted,
        recoveryResult: recoveryAttempted.result,
        finalDecision: decision,
        stackTrace,
        additionalContext: {
            currentTimeout,
            sessionId: context.sessionId
        }
    };

    const logPath = await logError(errorInfo);

    return {
        errorType: classification.type,
        retryable: classification.retryable,
        shouldRetry: decision.action === 'retry',
        recoveryAttempted: recoveryAttempted.attempted,
        recoverySuccess: recoveryAttempted.success,
        recoveryStrategy: recoveryAttempted.strategy,
        recoveryResult: recoveryAttempted.result,
        suggestion: decision.suggestion,
        errorLogPath: logPath,
        haltReason: decision.action === 'halt' ? decision.reason : null
    };
}

/**
 * Format error for display/workflow result
 *
 * @param {Object} error - Error object
 * @param {Object} classification - Error classification
 * @returns {Object} Formatted error
 */
function formatError(error, classification) {
    return {
        message: error.message,
        type: classification.type,
        retryable: classification.retryable,
        suggestion: classification.metadata.suggestion,
        timestamp: new Date().toISOString()
    };
}

module.exports = {
    ERROR_TYPES,
    RETRYABILITY,
    RECOVERY_STRATEGIES,
    classifyError,
    attemptRecovery,
    decideRecoveryAction,
    handleWorkflowError,
    logError,
    formatError
};