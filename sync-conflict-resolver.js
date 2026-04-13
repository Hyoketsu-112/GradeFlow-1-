/**
 * 🔄 Conflict Resolver
 *
 * Resolves conflicts between local and remote data
 * Week 19-20 Implementation
 */

class ConflictResolver {
  /**
   * Check if conflict exists between local and remote records
   */
  static detectConflict(local, remote) {
    // No local = use remote
    if (!local) return { conflict: false, resolution: "use_remote" };

    // No remote = keep local
    if (!remote) return { conflict: false, resolution: "use_local" };

    // Same timestamp = same record
    if (local.updated_at === remote.updated_at) {
      return { conflict: false, resolution: "no_conflict" };
    }

    // Different timestamps = conflict
    return {
      conflict: true,
      local_updated_at: local.updated_at,
      remote_updated_at: remote.updated_at,
      newer: remote.updated_at > local.updated_at ? "remote" : "local",
    };
  }

  /**
   * Resolve by last-write-wins (timestamp comparison)
   */
  static resolveByTimestamp(local, remote) {
    if (!remote) return { resolved: true, winner: "local", value: local };
    if (!local) return { resolved: true, winner: "remote", value: remote };

    if (remote.updated_at > local.updated_at) {
      return {
        resolved: true,
        winner: "remote",
        value: remote,
        reason: "remote timestamp newer",
      };
    } else if (local.updated_at > remote.updated_at) {
      return {
        resolved: true,
        winner: "local",
        value: local,
        reason: "local timestamp newer",
      };
    } else {
      // Timestamps equal - keep local (deterministic)
      return {
        resolved: true,
        winner: "local",
        value: local,
        reason: "timestamps equal, preferring local",
      };
    }
  }

  /**
   * Merge scores component-by-component
   * Allows partial updates (e.g., test score changed remotely, practical changed locally)
   */
  static mergeScores(local, remote) {
    if (!remote) return { merged: true, value: local };
    if (!local) return { merged: true, value: remote };

    // Component timestamps (if available)
    const localTest = local.test;
    const remoteTest = remote.test;
    const localPractical = local.practical;
    const remotePractical = remote.practical;
    const localExam = local.exam;
    const remoteExam = remote.exam;

    // Use newer value for each component
    const merged = {
      ...remote, // Start with remote
      test: localTest !== remoteTest ? remoteTest : localTest,
      practical:
        localPractical !== remotePractical ? remotePractical : localPractical,
      exam: localExam !== remoteExam ? remoteExam : localExam,
      updated_at: Math.max(local.updated_at, remote.updated_at),
      _merge_info: {
        test_from: localTest !== remoteTest ? "remote" : "local",
        practical_from: localPractical !== remotePractical ? "remote" : "local",
        exam_from: localExam !== remoteExam ? "remote" : "local",
      },
    };

    return { merged: true, value: merged };
  }

  /**
   * Merge attendance records
   */
  static mergeAttendance(local, remote) {
    if (!remote) return { merged: true, value: local };
    if (!local) return { merged: true, value: remote };

    // For attendance, use the most recent status change
    if (remote.updated_at > local.updated_at) {
      return { merged: true, value: remote };
    }
    return { merged: true, value: local };
  }

  /**
   * Get optimal strategy for entity type
   */
  static getStrategy(entityType) {
    const strategies = {
      scores: "merge_components", // Component-level merge
      attendance: "last_write_wins", // Last write wins
      materials: "last_write_wins",
      quizzes: "last_write_wins",
      classes: "last_write_wins",
      audit_logs: "no_conflict", // Never conflict (append-only)
    };

    return strategies[entityType] || "last_write_wins";
  }

  /**
   * Resolve conflict based on entity type and strategy
   */
  static resolve(entityType, local, remote) {
    const strategy = this.getStrategy(entityType);

    switch (strategy) {
      case "merge_components":
        if (entityType === "scores") {
          return this.mergeScores(local, remote);
        } else if (entityType === "attendance") {
          return this.mergeAttendance(local, remote);
        }
        break;

      case "last_write_wins":
        return this.resolveByTimestamp(local, remote);

      case "no_conflict":
        // Append-only, always add both
        return { merged: true, value: local, note: "append_only" };

      default:
        return this.resolveByTimestamp(local, remote);
    }
  }

  /**
   * Analyze conflict severity
   */
  static analyzeSeverity(local, remote) {
    if (!local || !remote) {
      return { severity: "low", type: "missing_record" };
    }

    // Check if critical fields differ
    const differentCount = Object.keys(local).filter(
      (key) => local[key] !== remote[key] && !key.startsWith("_"),
    ).length;

    if (differentCount === 0) {
      return { severity: "none", type: "identical" };
    } else if (differentCount === 1) {
      return { severity: "low", type: "single_field" };
    } else if (differentCount <= 3) {
      return { severity: "medium", type: "multiple_fields" };
    } else {
      return { severity: "high", type: "major_differences" };
    }
  }

  /**
   * Generate conflict report for logging
   */
  static generateConflictReport(queueEntry, local, remote, resolution) {
    return {
      id: queueEntry.id,
      entityType: queueEntry.entity_type,
      entityId: queueEntry.entity_id,
      operation: queueEntry.operation,
      timestamp: Date.now(),
      conflict: {
        local: {
          value: local,
          updated_at: local?.updated_at,
        },
        remote: {
          value: remote,
          updated_at: remote?.updated_at,
        },
      },
      resolution: {
        strategy: this.getStrategy(queueEntry.entity_type),
        winner: resolution.winner,
        value: resolution.value,
        reason: resolution.reason,
      },
      severity: this.analyzeSeverity(local, remote),
    };
  }
}

// Export for use
if (typeof module !== "undefined" && module.exports) {
  module.exports = ConflictResolver;
}
