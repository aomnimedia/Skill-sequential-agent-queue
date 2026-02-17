/**
 * Resource Management for Sequential Agent Queue
 *
 * Handles cleanup, monitoring, and management of system resources
 * for workflow execution.
 *
 * @author Vincent [Agent: CODER]
 * @version 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Configuration
 */
const CONFIG = {
    // Output file cleanup
    outputRetentionDays: 30,
    cleanupIntervalMs: 24 * 60 * 60 * 1000, // Daily

    // Workflow resource limits
    maxStagesPerWorkflow: 50,
    maxWorkflowDurationHours: 24,
    maxMemoryUsageMB: 1024, // 1GB

    // Disk space thresholds (percentage of disk full)
    diskSpaceWarningThreshold: 80,
    diskSpaceCriticalThreshold: 90
};

/**
 * Get current memory usage in MB
 *
 * @returns {number} Memory usage in MB
 */
function getMemoryUsageMB() {
    const usage = process.memoryUsage();
    return Math.round(usage.heapUsed / 1024 / 1024);
}

/**
 * Get workflow output age in days
 *
 * @param {string} filePath - Path to output file
 * @returns {Promise<number>} Age in days
 */
async function getFileAgeDays(filePath) {
    try {
        const stats = await fs.stat(filePath);
        const now = new Date();
        const fileDate = new Date(stats.mtime);
        const ageMs = now - fileDate;
        return Math.floor(ageMs / (1000 * 60 * 60 * 24));
    } catch (error) {
        console.warn(`[resource-warn] Could not get file age for ${filePath}: ${error.message}`);
        return 0;
    }
}

/**
 * Clean up old output files
 *
 * @param {string} outputDir - Directory containing workflow outputs
 * @param {number} retentionDays - Days to retain files (default from CONFIG)
 * @returns {Promise<Object>} Cleanup statistics
 */
async function cleanupOldOutputs(outputDir, retentionDays = CONFIG.outputRetentionDays) {
    console.log(`[cleanup] Starting cleanup of old outputs in: ${outputDir}`);
    console.log(`[cleanup] Retention period: ${retentionDays} days`);

    const stats = {
        filesScanned: 0,
        filesDeleted: 0,
        bytesFreed: 0,
        errors: []
    };

    try {
        // Check if output directory exists
        await fs.access(outputDir);

        // Recursively find all files
        const files = await findFilesRecursive(outputDir);
        stats.filesScanned = files.length;

        console.log(`[cleanup] Found ${files.length} files to check`);

        for (const filePath of files) {
            try {
                const ageDays = await getFileAgeDays(filePath);

                if (ageDays > retentionDays) {
                    const fileStats = await fs.stat(filePath);
                    await fs.unlink(filePath);

                    stats.filesDeleted++;
                    stats.bytesFreed += fileStats.size;

                    console.log(`[cleanup] Deleted: ${filePath} (${ageDays} days old, ${formatBytes(fileStats.size)})`);
                }
            } catch (error) {
                stats.errors.push({
                    file: filePath,
                    error: error.message
                });
                console.warn(`[cleanup-warn] Could not delete ${filePath}: ${error.message}`);
            }
        }

        console.log(`[cleanup-complete] Files scanned: ${stats.filesScanned}`);
        console.log(`[cleanup-complete] Files deleted: ${stats.filesDeleted}`);
        console.log(`[cleanup-complete] Bytes freed: ${formatBytes(stats.bytesFreed)}`);
        console.log(`[cleanup-complete] Errors: ${stats.errors.length}`);

        return stats;

    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`[cleanup] Output directory does not exist: ${outputDir}`);
            return stats;
        }
        console.error(`[cleanup-error] Cleanup failed: ${error.message}`);
        throw error;
    }
}

/**
 * Recursively find all files in directory
 *
 * @param {string} dir - Directory to scan
 * @returns {Promise<string[]>} Array of file paths
 */
async function findFilesRecursive(dir) {
    let files = [];

    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                files = files.concat(await findFilesRecursive(fullPath));
            } else if (entry.isFile()) {
                files.push(fullPath);
            }
        }
    } catch (error) {
        console.warn(`[find-files-warn] Could not scan directory ${dir}: ${error.message}`);
    }

    return files;
}

/**
 * Check available disk space
 *
 * @param {string} path - Path to check (default: current working directory)
 * @returns {Promise<Object>} Disk space info
 */
async function checkDiskSpace(targetPath = process.cwd()) {
    try {
        // This is a simplified disk space check
        // In a real implementation, would use system-specific commands
        // For now, just check if we can write to the directory

        const testFile = path.join(targetPath, '.disk-space-test');
        await fs.writeFile(testFile, 'test', 'utf-8');
        await fs.unlink(testFile);

        return {
            path: targetPath,
            writable: true,
            message: 'Disk write test successful'
        };
    } catch (error) {
        console.warn(`[disk-space-warn] Could not verify disk space: ${error.message}`);
        return {
            path: targetPath,
            writable: false,
            message: error.message
        };
    }
}

/**
 * Validate workflow resource configuration
 *
 * @param {Object} workflow - Workflow to validate
 * @returns {Object} Validation result
 */
function validateWorkflowResources(workflow) {
    const errors = [];
    const warnings = [];

    // Check stage count
    if (workflow.stages.length > CONFIG.maxStagesPerWorkflow) {
        warnings.push(`Workflow has ${workflow.stages.length} stages (max recommended: ${CONFIG.maxStagesPerWorkflow})`);
    }

    // Check timeout configuration
    const maxTimeout = workflow.stageTimeoutMinutes || 15;
    if (maxTimeout > 120) {
        warnings.push(`Stage timeout is ${maxTimeout} minutes (max recommended: 120)`);
    }

    // Working directory exists?
    const workingDir = workflow.workingDirectory || process.cwd();
    try {
        fs.accessSync(workingDir, fs.constants.W_OK);
    } catch (error) {
        errors.push(`Working directory is not writable: ${workingDir}`);
    }

    // Check retry configuration
    const maxRetries = workflow.retryOnFailure || 0;
    if (maxRetries > 5) {
        warnings.push(`Retry count is ${maxRetries} (max recommended: 5)`);
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Monitor memory usage during workflow execution
 * Returns cleanup recommendations if memory is high
 *
 * @param {number} currentUsageMB - Current memory usage in MB
 * @returns {Object} Monitor result
 */
function monitorMemoryUsage(currentUsageMB) {
    const result = {
        currentMB: currentUsageMB,
        thresholdMB: CONFIG.maxMemoryUsageMB,
        usagePercent: Math.round((currentUsageMB / CONFIG.maxMemoryUsageMB) * 100),
        status: 'ok',
        recommendations: []
    };

    if (result.usagePercent > 80) {
        result.status = 'warning';
        result.recommendations.push('Memory usage is high (>80%)');
        result.recommendations.push('Consider running garbage collection: process.gc()');
    } else if (result.usagePercent > 90) {
        result.status = 'critical';
        result.recommendations.push('Memory usage is critical (>90%)');
        result.recommendations.push('Trigger cleanup of old outputs');
        result.recommendations.push('Consider splitting workflow into smaller parts');
    }

    if (result.status !== 'ok') {
        console.warn(`[memory-monitor] Status: ${result.status} (${currentUsageMB}MB / ${CONFIG.maxMemoryUsageMB}MB)`);
        result.recommendations.forEach(rec => console.warn(`[memory-monitor] Recommendation: ${rec}`));
    }

    return result;
}

/**
 * Cleanup before workflow execution
 *
 * @param {Object} workflow - Workflow being executed
 * @param {Object} options - Cleanup options
 * @returns {Promise<Object>} Cleanup result
 */
async function preWorkflowCleanup(workflow, options = {}) {
    console.log(`[cleanup] Pre-workflow cleanup for: ${workflow.name}`);

    const result = {
        cleanedUp: false,
        errors: [],
        warnings: []
    };

    try {
        // Validate workflow resources
        const resourceValidation = validateWorkflowResources(workflow);

        if (!resourceValidation.valid) {
            result.errors.push(...resourceValidation.errors);
            console.error('[cleanup-error] Workflow resource validation failed:', resourceValidation.errors);
        } else if (resourceValidation.warnings.length > 0) {
            result.warnings.push(...resourceValidation.warnings);
            resourceValidation.warnings.forEach(warning => console.warn('[cleanup-warn]', warning));
        }

        // Check disk space
        const workingDir = workflow.workingDirectory || process.cwd();
        const diskSpace = await checkDiskSpace(workingDir);

        if (!diskSpace.writable) {
            result.errors.push(`Disk space check failed: ${diskSpace.message}`);
            console.error('[cleanup-error]', result.errors[result.errors.length - 1]);
        }

        // Clean up old outputs if enabled
        if (options.cleanupOldOutputs !== false) {
            const retentionDays = options.retentionDays || CONFIG.outputRetentionDays;
            const outputBaseDir = path.join(workingDir, '*', 'outputs');

            const cleanupStats = await cleanupOldOutputs(outputBaseDir, retentionDays);

            if (cleanupStats.filesDeleted > 0) {
                result.cleanedUp = true;
                console.log(`[cleanup] Cleaned up ${cleanupStats.filesDeleted} old files (${formatBytes(cleanupStats.bytesFreed)})`);
            }
        }

        return result;

    } catch (error) {
        result.errors.push(`Pre-workflow cleanup failed: ${error.message}`);
        console.error('[cleanup-error]', error.message);
        return result;
    }
}

/**
 * Cleanup after workflow completion
 *
 * @param {Object} workflowResult - Workflow execution result
 * @returns {Promise<Object>} Cleanup result
 */
async function postWorkflowCleanup(workflowResult) {
    console.log(`[cleanup] Post-workflow cleanup for: ${workflowResult.workflow}`);

    const result = {
        cleanedUp: false,
        memoryUsage: getMemoryUsageMB(),
        recommendations: []
    };

    try {
        // Check memory usage
        const memoryMonitor = monitorMemoryUsage(result.memoryUsage);

        if (memoryMonitor.status === 'warning' || memoryMonitor.status === 'critical') {
            result.recommendations.push(...memoryMonitor.recommendations);

            // Trigger immediate cleanup if memory is critical
            if (memoryMonitor.status === 'critical') {
                console.log('[cleanup] Memory critical, triggering cleanup...');
                const workingDir = process.cwd();
                const outputBaseDir = path.join(workingDir, '*', 'outputs');
                await cleanupOldOutputs(outputBaseDir, CONFIG.outputRetentionDays / 2);
                result.cleanedUp = true;
            }
        }

        return result;

    } catch (error) {
        console.error('[cleanup-error]', error.message);
        result.errors.push(error.message);
        return result;
    }
}

/**
 * Format bytes to human-readable string
 *
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted string (e.g., "1.2 MB")
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get resource usage report
 *
 * @returns {Object} Resource usage report
 */
function getResourceReport() {
    const usage = process.memoryUsage();

    return {
        timestamp: new Date().toISOString(),
        memory: {
            heapUsed: formatBytes(usage.heapUsed),
            heapTotal: formatBytes(usage.heapTotal),
            external: formatBytes(usage.external),
            rss: formatBytes(usage.rss),
            percentUsed: Math.round((usage.heapUsed / usage.heapTotal) * 100)
        },
        duration: {
            uptimeSecs: Math.floor(process.uptime()),
            uptimeFormatted: formatUptime(process.uptime())
        }
    };
}

/**
 * Format uptime to human-readable string
 *
 * @param {number} uptimeSeconds - Uptime in seconds
 * @returns {string} Formatted uptime
 */
function formatUptime(uptimeSeconds) {
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    } else {
        return `${seconds}s`;
    }
}

module.exports = {
    CONFIG,
    getMemoryUsageMB,
    cleanupOldOutputs,
    findFilesRecursive,
    checkDiskSpace,
    validateWorkflowResources,
    monitorMemoryUsage,
    preWorkflowCleanup,
    postWorkflowCleanup,
    getResourceReport,
    formatBytes
};