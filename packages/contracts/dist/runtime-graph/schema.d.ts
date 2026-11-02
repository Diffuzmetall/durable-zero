import { z } from "zod";
export declare const MAX_LIVE_NODES = 512;
export declare const MAX_RECEIPTS = 128;
export declare const MAX_LABEL_LENGTH = 160;
export declare const MAX_PREVIEW_LENGTH = 500;
export declare const MAX_SNAPSHOT_BYTES = 1048576;
export declare const TASK_OUTCOMES: readonly ["completed", "failed", "aborted", "faulted", "orphaned"];
export declare const taskOutcomeSchema: z.ZodEnum<["completed", "failed", "aborted", "faulted", "orphaned"]>;
export declare const LIVE_TASK_STATUSES: readonly ["pending", "running", "waiting", "sleeping", "completing"];
export declare const liveTaskStatusSchema: z.ZodEnum<["pending", "running", "waiting", "sleeping", "completing"]>;
export declare const BLOCKED_REASONS: readonly ["missing_task", "task_too_old", "migration_failed", "restart_limit"];
export declare const blockedReasonSchema: z.ZodEnum<["missing_task", "task_too_old", "migration_failed", "restart_limit"]>;
export declare const graphScopeSchema: z.ZodObject<{
    sessionId: z.ZodString;
    rootConversationId: z.ZodString;
    buildId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    sessionId: string;
    rootConversationId: string;
    buildId: string;
}, {
    sessionId: string;
    rootConversationId: string;
    buildId: string;
}>;
export declare const graphObservationSchema: z.ZodObject<{
    epoch: z.ZodString;
    revision: z.ZodNumber;
    observedAt: z.ZodNumber;
    completeness: z.ZodEnum<["complete", "limited"]>;
}, "strip", z.ZodTypeAny, {
    epoch: string;
    revision: number;
    observedAt: number;
    completeness: "complete" | "limited";
}, {
    epoch: string;
    revision: number;
    observedAt: number;
    completeness: "complete" | "limited";
}>;
export declare const runtimeTaskStateSchema: z.ZodDiscriminatedUnion<"status", [z.ZodObject<{
    status: z.ZodLiteral<"pending">;
    phase: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "pending";
    phase?: string | undefined;
}, {
    status: "pending";
    phase?: string | undefined;
}>, z.ZodObject<{
    status: z.ZodLiteral<"running">;
    phase: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "running";
    phase?: string | undefined;
}, {
    status: "running";
    phase?: string | undefined;
}>, z.ZodObject<{
    status: z.ZodLiteral<"waiting">;
    phase: z.ZodOptional<z.ZodString>;
    on: z.ZodArray<z.ZodNumber, "many">;
    policy: z.ZodOptional<z.ZodEnum<["failFast", "allSettled", "all", "first"]>>;
}, "strip", z.ZodTypeAny, {
    status: "waiting";
    on: number[];
    phase?: string | undefined;
    policy?: "failFast" | "allSettled" | "all" | "first" | undefined;
}, {
    status: "waiting";
    on: number[];
    phase?: string | undefined;
    policy?: "failFast" | "allSettled" | "all" | "first" | undefined;
}>, z.ZodObject<{
    status: z.ZodLiteral<"sleeping">;
    phase: z.ZodOptional<z.ZodString>;
    until: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    status: "sleeping";
    until: number;
    phase?: string | undefined;
}, {
    status: "sleeping";
    until: number;
    phase?: string | undefined;
}>, z.ZodObject<{
    status: z.ZodLiteral<"completing">;
    outcome: z.ZodEnum<["completed", "failed", "aborted", "faulted", "orphaned"]>;
}, "strip", z.ZodTypeAny, {
    status: "completing";
    outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
}, {
    status: "completing";
    outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
}>]>;
export declare const taskTokensUsageSchema: z.ZodObject<{
    total: z.ZodOptional<z.ZodNumber>;
    input: z.ZodOptional<z.ZodNumber>;
    output: z.ZodOptional<z.ZodNumber>;
    reasoning: z.ZodOptional<z.ZodNumber>;
    cacheRead: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    total?: number | undefined;
    input?: number | undefined;
    output?: number | undefined;
    cacheRead?: number | undefined;
    reasoning?: number | undefined;
}, {
    total?: number | undefined;
    input?: number | undefined;
    output?: number | undefined;
    cacheRead?: number | undefined;
    reasoning?: number | undefined;
}>;
export declare const runtimeTaskNodeSchema: z.ZodObject<{
    id: z.ZodNumber;
    kind: z.ZodString;
    conversationId: z.ZodNumber;
    owner: z.ZodOptional<z.ZodNumber>;
    background: z.ZodBoolean;
    abortRequested: z.ZodBoolean;
    state: z.ZodDiscriminatedUnion<"status", [z.ZodObject<{
        status: z.ZodLiteral<"pending">;
        phase: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        status: "pending";
        phase?: string | undefined;
    }, {
        status: "pending";
        phase?: string | undefined;
    }>, z.ZodObject<{
        status: z.ZodLiteral<"running">;
        phase: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        status: "running";
        phase?: string | undefined;
    }, {
        status: "running";
        phase?: string | undefined;
    }>, z.ZodObject<{
        status: z.ZodLiteral<"waiting">;
        phase: z.ZodOptional<z.ZodString>;
        on: z.ZodArray<z.ZodNumber, "many">;
        policy: z.ZodOptional<z.ZodEnum<["failFast", "allSettled", "all", "first"]>>;
    }, "strip", z.ZodTypeAny, {
        status: "waiting";
        on: number[];
        phase?: string | undefined;
        policy?: "failFast" | "allSettled" | "all" | "first" | undefined;
    }, {
        status: "waiting";
        on: number[];
        phase?: string | undefined;
        policy?: "failFast" | "allSettled" | "all" | "first" | undefined;
    }>, z.ZodObject<{
        status: z.ZodLiteral<"sleeping">;
        phase: z.ZodOptional<z.ZodString>;
        until: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        status: "sleeping";
        until: number;
        phase?: string | undefined;
    }, {
        status: "sleeping";
        until: number;
        phase?: string | undefined;
    }>, z.ZodObject<{
        status: z.ZodLiteral<"completing">;
        outcome: z.ZodEnum<["completed", "failed", "aborted", "faulted", "orphaned"]>;
    }, "strip", z.ZodTypeAny, {
        status: "completing";
        outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
    }, {
        status: "completing";
        outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
    }>]>;
    blocked: z.ZodOptional<z.ZodEnum<["missing_task", "task_too_old", "migration_failed", "restart_limit"]>>;
    label: z.ZodString;
    startedAt: z.ZodOptional<z.ZodNumber>;
    endedAt: z.ZodOptional<z.ZodNumber>;
    durationMs: z.ZodOptional<z.ZodNumber>;
    toolName: z.ZodOptional<z.ZodString>;
    targetHint: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodObject<{
        provider: z.ZodString;
        modelId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        provider: string;
        modelId: string;
    }, {
        provider: string;
        modelId: string;
    }>>;
    thinkingLevel: z.ZodOptional<z.ZodString>;
    tokens: z.ZodOptional<z.ZodObject<{
        total: z.ZodOptional<z.ZodNumber>;
        input: z.ZodOptional<z.ZodNumber>;
        output: z.ZodOptional<z.ZodNumber>;
        reasoning: z.ZodOptional<z.ZodNumber>;
        cacheRead: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        total?: number | undefined;
        input?: number | undefined;
        output?: number | undefined;
        cacheRead?: number | undefined;
        reasoning?: number | undefined;
    }, {
        total?: number | undefined;
        input?: number | undefined;
        output?: number | undefined;
        cacheRead?: number | undefined;
        reasoning?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    kind: string;
    id: number;
    conversationId: number;
    background: boolean;
    abortRequested: boolean;
    state: {
        status: "pending";
        phase?: string | undefined;
    } | {
        status: "running";
        phase?: string | undefined;
    } | {
        status: "waiting";
        on: number[];
        phase?: string | undefined;
        policy?: "failFast" | "allSettled" | "all" | "first" | undefined;
    } | {
        status: "sleeping";
        until: number;
        phase?: string | undefined;
    } | {
        status: "completing";
        outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
    };
    label: string;
    thinkingLevel?: string | undefined;
    toolName?: string | undefined;
    owner?: number | undefined;
    blocked?: "missing_task" | "task_too_old" | "migration_failed" | "restart_limit" | undefined;
    startedAt?: number | undefined;
    endedAt?: number | undefined;
    durationMs?: number | undefined;
    targetHint?: string | undefined;
    model?: {
        provider: string;
        modelId: string;
    } | undefined;
    tokens?: {
        total?: number | undefined;
        input?: number | undefined;
        output?: number | undefined;
        cacheRead?: number | undefined;
        reasoning?: number | undefined;
    } | undefined;
}, {
    kind: string;
    id: number;
    conversationId: number;
    background: boolean;
    abortRequested: boolean;
    state: {
        status: "pending";
        phase?: string | undefined;
    } | {
        status: "running";
        phase?: string | undefined;
    } | {
        status: "waiting";
        on: number[];
        phase?: string | undefined;
        policy?: "failFast" | "allSettled" | "all" | "first" | undefined;
    } | {
        status: "sleeping";
        until: number;
        phase?: string | undefined;
    } | {
        status: "completing";
        outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
    };
    label: string;
    thinkingLevel?: string | undefined;
    toolName?: string | undefined;
    owner?: number | undefined;
    blocked?: "missing_task" | "task_too_old" | "migration_failed" | "restart_limit" | undefined;
    startedAt?: number | undefined;
    endedAt?: number | undefined;
    durationMs?: number | undefined;
    targetHint?: string | undefined;
    model?: {
        provider: string;
        modelId: string;
    } | undefined;
    tokens?: {
        total?: number | undefined;
        input?: number | undefined;
        output?: number | undefined;
        cacheRead?: number | undefined;
        reasoning?: number | undefined;
    } | undefined;
}>;
export declare const runtimeConversationNodeSchema: z.ZodObject<{
    id: z.ZodNumber;
    owner: z.ZodOptional<z.ZodObject<{
        conversationId: z.ZodNumber;
        taskId: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        conversationId: number;
        taskId: number;
    }, {
        conversationId: number;
        taskId: number;
    }>>;
    parent: z.ZodOptional<z.ZodObject<{
        conversationId: z.ZodNumber;
        at: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        at: number;
        conversationId: number;
    }, {
        at: number;
        conversationId: number;
    }>>;
}, "strip", z.ZodTypeAny, {
    id: number;
    owner?: {
        conversationId: number;
        taskId: number;
    } | undefined;
    parent?: {
        at: number;
        conversationId: number;
    } | undefined;
}, {
    id: number;
    owner?: {
        conversationId: number;
        taskId: number;
    } | undefined;
    parent?: {
        at: number;
        conversationId: number;
    } | undefined;
}>;
export declare const runtimeTaskReceiptSchema: z.ZodObject<{
    taskId: z.ZodNumber;
    conversationId: z.ZodNumber;
    owner: z.ZodOptional<z.ZodNumber>;
    kind: z.ZodString;
    outcome: z.ZodEnum<["completed", "failed", "aborted", "faulted", "orphaned"]>;
    isToolError: z.ZodOptional<z.ZodBoolean>;
    error: z.ZodOptional<z.ZodObject<{
        message: z.ZodString;
        code: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        code?: string | undefined;
    }, {
        message: string;
        code?: string | undefined;
    }>>;
    endedAt: z.ZodNumber;
    durationMs: z.ZodOptional<z.ZodNumber>;
    preview: z.ZodOptional<z.ZodString>;
    toolName: z.ZodOptional<z.ZodString>;
    targetHint: z.ZodOptional<z.ZodString>;
    startedAt: z.ZodOptional<z.ZodNumber>;
    tokens: z.ZodOptional<z.ZodObject<{
        total: z.ZodOptional<z.ZodNumber>;
        input: z.ZodOptional<z.ZodNumber>;
        output: z.ZodOptional<z.ZodNumber>;
        reasoning: z.ZodOptional<z.ZodNumber>;
        cacheRead: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        total?: number | undefined;
        input?: number | undefined;
        output?: number | undefined;
        cacheRead?: number | undefined;
        reasoning?: number | undefined;
    }, {
        total?: number | undefined;
        input?: number | undefined;
        output?: number | undefined;
        cacheRead?: number | undefined;
        reasoning?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    kind: string;
    conversationId: number;
    taskId: number;
    outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
    endedAt: number;
    error?: {
        message: string;
        code?: string | undefined;
    } | undefined;
    toolName?: string | undefined;
    owner?: number | undefined;
    startedAt?: number | undefined;
    durationMs?: number | undefined;
    targetHint?: string | undefined;
    tokens?: {
        total?: number | undefined;
        input?: number | undefined;
        output?: number | undefined;
        cacheRead?: number | undefined;
        reasoning?: number | undefined;
    } | undefined;
    isToolError?: boolean | undefined;
    preview?: string | undefined;
}, {
    kind: string;
    conversationId: number;
    taskId: number;
    outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
    endedAt: number;
    error?: {
        message: string;
        code?: string | undefined;
    } | undefined;
    toolName?: string | undefined;
    owner?: number | undefined;
    startedAt?: number | undefined;
    durationMs?: number | undefined;
    targetHint?: string | undefined;
    tokens?: {
        total?: number | undefined;
        input?: number | undefined;
        output?: number | undefined;
        cacheRead?: number | undefined;
        reasoning?: number | undefined;
    } | undefined;
    isToolError?: boolean | undefined;
    preview?: string | undefined;
}>;
export declare const runtimeGraphStatsSchema: z.ZodObject<{
    liveCount: z.ZodNumber;
    terminalCount: z.ZodNumber;
    totalCount: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    liveCount: number;
    terminalCount: number;
    totalCount: number;
}, {
    liveCount: number;
    terminalCount: number;
    totalCount: number;
}>;
export declare function getUtf8ByteLength(str: string): number;
export declare const runtimeGraphSnapshotSchema: z.ZodEffects<z.ZodObject<{
    version: z.ZodLiteral<1>;
    scope: z.ZodObject<{
        sessionId: z.ZodString;
        rootConversationId: z.ZodString;
        buildId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        sessionId: string;
        rootConversationId: string;
        buildId: string;
    }, {
        sessionId: string;
        rootConversationId: string;
        buildId: string;
    }>;
    observation: z.ZodObject<{
        epoch: z.ZodString;
        revision: z.ZodNumber;
        observedAt: z.ZodNumber;
        completeness: z.ZodEnum<["complete", "limited"]>;
    }, "strip", z.ZodTypeAny, {
        epoch: string;
        revision: number;
        observedAt: number;
        completeness: "complete" | "limited";
    }, {
        epoch: string;
        revision: number;
        observedAt: number;
        completeness: "complete" | "limited";
    }>;
    nodes: z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodObject<{
        id: z.ZodNumber;
        kind: z.ZodString;
        conversationId: z.ZodNumber;
        owner: z.ZodOptional<z.ZodNumber>;
        background: z.ZodBoolean;
        abortRequested: z.ZodBoolean;
        state: z.ZodDiscriminatedUnion<"status", [z.ZodObject<{
            status: z.ZodLiteral<"pending">;
            phase: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            status: "pending";
            phase?: string | undefined;
        }, {
            status: "pending";
            phase?: string | undefined;
        }>, z.ZodObject<{
            status: z.ZodLiteral<"running">;
            phase: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            status: "running";
            phase?: string | undefined;
        }, {
            status: "running";
            phase?: string | undefined;
        }>, z.ZodObject<{
            status: z.ZodLiteral<"waiting">;
            phase: z.ZodOptional<z.ZodString>;
            on: z.ZodArray<z.ZodNumber, "many">;
            policy: z.ZodOptional<z.ZodEnum<["failFast", "allSettled", "all", "first"]>>;
        }, "strip", z.ZodTypeAny, {
            status: "waiting";
            on: number[];
            phase?: string | undefined;
            policy?: "failFast" | "allSettled" | "all" | "first" | undefined;
        }, {
            status: "waiting";
            on: number[];
            phase?: string | undefined;
            policy?: "failFast" | "allSettled" | "all" | "first" | undefined;
        }>, z.ZodObject<{
            status: z.ZodLiteral<"sleeping">;
            phase: z.ZodOptional<z.ZodString>;
            until: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            status: "sleeping";
            until: number;
            phase?: string | undefined;
        }, {
            status: "sleeping";
            until: number;
            phase?: string | undefined;
        }>, z.ZodObject<{
            status: z.ZodLiteral<"completing">;
            outcome: z.ZodEnum<["completed", "failed", "aborted", "faulted", "orphaned"]>;
        }, "strip", z.ZodTypeAny, {
            status: "completing";
            outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
        }, {
            status: "completing";
            outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
        }>]>;
        blocked: z.ZodOptional<z.ZodEnum<["missing_task", "task_too_old", "migration_failed", "restart_limit"]>>;
        label: z.ZodString;
        startedAt: z.ZodOptional<z.ZodNumber>;
        endedAt: z.ZodOptional<z.ZodNumber>;
        durationMs: z.ZodOptional<z.ZodNumber>;
        toolName: z.ZodOptional<z.ZodString>;
        targetHint: z.ZodOptional<z.ZodString>;
        model: z.ZodOptional<z.ZodObject<{
            provider: z.ZodString;
            modelId: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            provider: string;
            modelId: string;
        }, {
            provider: string;
            modelId: string;
        }>>;
        thinkingLevel: z.ZodOptional<z.ZodString>;
        tokens: z.ZodOptional<z.ZodObject<{
            total: z.ZodOptional<z.ZodNumber>;
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            reasoning: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            total?: number | undefined;
            input?: number | undefined;
            output?: number | undefined;
            cacheRead?: number | undefined;
            reasoning?: number | undefined;
        }, {
            total?: number | undefined;
            input?: number | undefined;
            output?: number | undefined;
            cacheRead?: number | undefined;
            reasoning?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        kind: string;
        id: number;
        conversationId: number;
        background: boolean;
        abortRequested: boolean;
        state: {
            status: "pending";
            phase?: string | undefined;
        } | {
            status: "running";
            phase?: string | undefined;
        } | {
            status: "waiting";
            on: number[];
            phase?: string | undefined;
            policy?: "failFast" | "allSettled" | "all" | "first" | undefined;
        } | {
            status: "sleeping";
            until: number;
            phase?: string | undefined;
        } | {
            status: "completing";
            outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
        };
        label: string;
        thinkingLevel?: string | undefined;
        toolName?: string | undefined;
        owner?: number | undefined;
        blocked?: "missing_task" | "task_too_old" | "migration_failed" | "restart_limit" | undefined;
        startedAt?: number | undefined;
        endedAt?: number | undefined;
        durationMs?: number | undefined;
        targetHint?: string | undefined;
        model?: {
            provider: string;
            modelId: string;
        } | undefined;
        tokens?: {
            total?: number | undefined;
            input?: number | undefined;
            output?: number | undefined;
            cacheRead?: number | undefined;
            reasoning?: number | undefined;
        } | undefined;
    }, {
        kind: string;
        id: number;
        conversationId: number;
        background: boolean;
        abortRequested: boolean;
        state: {
            status: "pending";
            phase?: string | undefined;
        } | {
            status: "running";
            phase?: string | undefined;
        } | {
            status: "waiting";
            on: number[];
            phase?: string | undefined;
            policy?: "failFast" | "allSettled" | "all" | "first" | undefined;
        } | {
            status: "sleeping";
            until: number;
            phase?: string | undefined;
        } | {
            status: "completing";
            outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
        };
        label: string;
        thinkingLevel?: string | undefined;
        toolName?: string | undefined;
        owner?: number | undefined;
        blocked?: "missing_task" | "task_too_old" | "migration_failed" | "restart_limit" | undefined;
        startedAt?: number | undefined;
        endedAt?: number | undefined;
        durationMs?: number | undefined;
        targetHint?: string | undefined;
        model?: {
            provider: string;
            modelId: string;
        } | undefined;
        tokens?: {
            total?: number | undefined;
            input?: number | undefined;
            output?: number | undefined;
            cacheRead?: number | undefined;
            reasoning?: number | undefined;
        } | undefined;
    }>>, Record<string, {
        kind: string;
        id: number;
        conversationId: number;
        background: boolean;
        abortRequested: boolean;
        state: {
            status: "pending";
            phase?: string | undefined;
        } | {
            status: "running";
            phase?: string | undefined;
        } | {
            status: "waiting";
            on: number[];
            phase?: string | undefined;
            policy?: "failFast" | "allSettled" | "all" | "first" | undefined;
        } | {
            status: "sleeping";
            until: number;
            phase?: string | undefined;
        } | {
            status: "completing";
            outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
        };
        label: string;
        thinkingLevel?: string | undefined;
        toolName?: string | undefined;
        owner?: number | undefined;
        blocked?: "missing_task" | "task_too_old" | "migration_failed" | "restart_limit" | undefined;
        startedAt?: number | undefined;
        endedAt?: number | undefined;
        durationMs?: number | undefined;
        targetHint?: string | undefined;
        model?: {
            provider: string;
            modelId: string;
        } | undefined;
        tokens?: {
            total?: number | undefined;
            input?: number | undefined;
            output?: number | undefined;
            cacheRead?: number | undefined;
            reasoning?: number | undefined;
        } | undefined;
    }>, Record<string, {
        kind: string;
        id: number;
        conversationId: number;
        background: boolean;
        abortRequested: boolean;
        state: {
            status: "pending";
            phase?: string | undefined;
        } | {
            status: "running";
            phase?: string | undefined;
        } | {
            status: "waiting";
            on: number[];
            phase?: string | undefined;
            policy?: "failFast" | "allSettled" | "all" | "first" | undefined;
        } | {
            status: "sleeping";
            until: number;
            phase?: string | undefined;
        } | {
            status: "completing";
            outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
        };
        label: string;
        thinkingLevel?: string | undefined;
        toolName?: string | undefined;
        owner?: number | undefined;
        blocked?: "missing_task" | "task_too_old" | "migration_failed" | "restart_limit" | undefined;
        startedAt?: number | undefined;
        endedAt?: number | undefined;
        durationMs?: number | undefined;
        targetHint?: string | undefined;
        model?: {
            provider: string;
            modelId: string;
        } | undefined;
        tokens?: {
            total?: number | undefined;
            input?: number | undefined;
            output?: number | undefined;
            cacheRead?: number | undefined;
            reasoning?: number | undefined;
        } | undefined;
    }>>;
    conversations: z.ZodRecord<z.ZodString, z.ZodObject<{
        id: z.ZodNumber;
        owner: z.ZodOptional<z.ZodObject<{
            conversationId: z.ZodNumber;
            taskId: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            conversationId: number;
            taskId: number;
        }, {
            conversationId: number;
            taskId: number;
        }>>;
        parent: z.ZodOptional<z.ZodObject<{
            conversationId: z.ZodNumber;
            at: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            at: number;
            conversationId: number;
        }, {
            at: number;
            conversationId: number;
        }>>;
    }, "strip", z.ZodTypeAny, {
        id: number;
        owner?: {
            conversationId: number;
            taskId: number;
        } | undefined;
        parent?: {
            at: number;
            conversationId: number;
        } | undefined;
    }, {
        id: number;
        owner?: {
            conversationId: number;
            taskId: number;
        } | undefined;
        parent?: {
            at: number;
            conversationId: number;
        } | undefined;
    }>>;
    receipts: z.ZodArray<z.ZodObject<{
        taskId: z.ZodNumber;
        conversationId: z.ZodNumber;
        owner: z.ZodOptional<z.ZodNumber>;
        kind: z.ZodString;
        outcome: z.ZodEnum<["completed", "failed", "aborted", "faulted", "orphaned"]>;
        isToolError: z.ZodOptional<z.ZodBoolean>;
        error: z.ZodOptional<z.ZodObject<{
            message: z.ZodString;
            code: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            message: string;
            code?: string | undefined;
        }, {
            message: string;
            code?: string | undefined;
        }>>;
        endedAt: z.ZodNumber;
        durationMs: z.ZodOptional<z.ZodNumber>;
        preview: z.ZodOptional<z.ZodString>;
        toolName: z.ZodOptional<z.ZodString>;
        targetHint: z.ZodOptional<z.ZodString>;
        startedAt: z.ZodOptional<z.ZodNumber>;
        tokens: z.ZodOptional<z.ZodObject<{
            total: z.ZodOptional<z.ZodNumber>;
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            reasoning: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            total?: number | undefined;
            input?: number | undefined;
            output?: number | undefined;
            cacheRead?: number | undefined;
            reasoning?: number | undefined;
        }, {
            total?: number | undefined;
            input?: number | undefined;
            output?: number | undefined;
            cacheRead?: number | undefined;
            reasoning?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        kind: string;
        conversationId: number;
        taskId: number;
        outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
        endedAt: number;
        error?: {
            message: string;
            code?: string | undefined;
        } | undefined;
        toolName?: string | undefined;
        owner?: number | undefined;
        startedAt?: number | undefined;
        durationMs?: number | undefined;
        targetHint?: string | undefined;
        tokens?: {
            total?: number | undefined;
            input?: number | undefined;
            output?: number | undefined;
            cacheRead?: number | undefined;
            reasoning?: number | undefined;
        } | undefined;
        isToolError?: boolean | undefined;
        preview?: string | undefined;
    }, {
        kind: string;
        conversationId: number;
        taskId: number;
        outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
        endedAt: number;
        error?: {
            message: string;
            code?: string | undefined;
        } | undefined;
        toolName?: string | undefined;
        owner?: number | undefined;
        startedAt?: number | undefined;
        durationMs?: number | undefined;
        targetHint?: string | undefined;
        tokens?: {
            total?: number | undefined;
            input?: number | undefined;
            output?: number | undefined;
            cacheRead?: number | undefined;
            reasoning?: number | undefined;
        } | undefined;
        isToolError?: boolean | undefined;
        preview?: string | undefined;
    }>, "many">;
    stats: z.ZodObject<{
        liveCount: z.ZodNumber;
        terminalCount: z.ZodNumber;
        totalCount: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        liveCount: number;
        terminalCount: number;
        totalCount: number;
    }, {
        liveCount: number;
        terminalCount: number;
        totalCount: number;
    }>;
}, "strip", z.ZodTypeAny, {
    version: 1;
    scope: {
        sessionId: string;
        rootConversationId: string;
        buildId: string;
    };
    observation: {
        epoch: string;
        revision: number;
        observedAt: number;
        completeness: "complete" | "limited";
    };
    nodes: Record<string, {
        kind: string;
        id: number;
        conversationId: number;
        background: boolean;
        abortRequested: boolean;
        state: {
            status: "pending";
            phase?: string | undefined;
        } | {
            status: "running";
            phase?: string | undefined;
        } | {
            status: "waiting";
            on: number[];
            phase?: string | undefined;
            policy?: "failFast" | "allSettled" | "all" | "first" | undefined;
        } | {
            status: "sleeping";
            until: number;
            phase?: string | undefined;
        } | {
            status: "completing";
            outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
        };
        label: string;
        thinkingLevel?: string | undefined;
        toolName?: string | undefined;
        owner?: number | undefined;
        blocked?: "missing_task" | "task_too_old" | "migration_failed" | "restart_limit" | undefined;
        startedAt?: number | undefined;
        endedAt?: number | undefined;
        durationMs?: number | undefined;
        targetHint?: string | undefined;
        model?: {
            provider: string;
            modelId: string;
        } | undefined;
        tokens?: {
            total?: number | undefined;
            input?: number | undefined;
            output?: number | undefined;
            cacheRead?: number | undefined;
            reasoning?: number | undefined;
        } | undefined;
    }>;
    conversations: Record<string, {
        id: number;
        owner?: {
            conversationId: number;
            taskId: number;
        } | undefined;
        parent?: {
            at: number;
            conversationId: number;
        } | undefined;
    }>;
    receipts: {
        kind: string;
        conversationId: number;
        taskId: number;
        outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
        endedAt: number;
        error?: {
            message: string;
            code?: string | undefined;
        } | undefined;
        toolName?: string | undefined;
        owner?: number | undefined;
        startedAt?: number | undefined;
        durationMs?: number | undefined;
        targetHint?: string | undefined;
        tokens?: {
            total?: number | undefined;
            input?: number | undefined;
            output?: number | undefined;
            cacheRead?: number | undefined;
            reasoning?: number | undefined;
        } | undefined;
        isToolError?: boolean | undefined;
        preview?: string | undefined;
    }[];
    stats: {
        liveCount: number;
        terminalCount: number;
        totalCount: number;
    };
}, {
    version: 1;
    scope: {
        sessionId: string;
        rootConversationId: string;
        buildId: string;
    };
    observation: {
        epoch: string;
        revision: number;
        observedAt: number;
        completeness: "complete" | "limited";
    };
    nodes: Record<string, {
        kind: string;
        id: number;
        conversationId: number;
        background: boolean;
        abortRequested: boolean;
        state: {
            status: "pending";
            phase?: string | undefined;
        } | {
            status: "running";
            phase?: string | undefined;
        } | {
            status: "waiting";
            on: number[];
            phase?: string | undefined;
            policy?: "failFast" | "allSettled" | "all" | "first" | undefined;
        } | {
            status: "sleeping";
            until: number;
            phase?: string | undefined;
        } | {
            status: "completing";
            outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
        };
        label: string;
        thinkingLevel?: string | undefined;
        toolName?: string | undefined;
        owner?: number | undefined;
        blocked?: "missing_task" | "task_too_old" | "migration_failed" | "restart_limit" | undefined;
        startedAt?: number | undefined;
        endedAt?: number | undefined;
        durationMs?: number | undefined;
        targetHint?: string | undefined;
        model?: {
            provider: string;
            modelId: string;
        } | undefined;
        tokens?: {
            total?: number | undefined;
            input?: number | undefined;
            output?: number | undefined;
            cacheRead?: number | undefined;
            reasoning?: number | undefined;
        } | undefined;
    }>;
    conversations: Record<string, {
        id: number;
        owner?: {
            conversationId: number;
            taskId: number;
        } | undefined;
        parent?: {
            at: number;
            conversationId: number;
        } | undefined;
    }>;
    receipts: {
        kind: string;
        conversationId: number;
        taskId: number;
        outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
        endedAt: number;
        error?: {
            message: string;
            code?: string | undefined;
        } | undefined;
        toolName?: string | undefined;
        owner?: number | undefined;
        startedAt?: number | undefined;
        durationMs?: number | undefined;
        targetHint?: string | undefined;
        tokens?: {
            total?: number | undefined;
            input?: number | undefined;
            output?: number | undefined;
            cacheRead?: number | undefined;
            reasoning?: number | undefined;
        } | undefined;
        isToolError?: boolean | undefined;
        preview?: string | undefined;
    }[];
    stats: {
        liveCount: number;
        terminalCount: number;
        totalCount: number;
    };
}>, {
    version: 1;
    scope: {
        sessionId: string;
        rootConversationId: string;
        buildId: string;
    };
    observation: {
        epoch: string;
        revision: number;
        observedAt: number;
        completeness: "complete" | "limited";
    };
    nodes: Record<string, {
        kind: string;
        id: number;
        conversationId: number;
        background: boolean;
        abortRequested: boolean;
        state: {
            status: "pending";
            phase?: string | undefined;
        } | {
            status: "running";
            phase?: string | undefined;
        } | {
            status: "waiting";
            on: number[];
            phase?: string | undefined;
            policy?: "failFast" | "allSettled" | "all" | "first" | undefined;
        } | {
            status: "sleeping";
            until: number;
            phase?: string | undefined;
        } | {
            status: "completing";
            outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
        };
        label: string;
        thinkingLevel?: string | undefined;
        toolName?: string | undefined;
        owner?: number | undefined;
        blocked?: "missing_task" | "task_too_old" | "migration_failed" | "restart_limit" | undefined;
        startedAt?: number | undefined;
        endedAt?: number | undefined;
        durationMs?: number | undefined;
        targetHint?: string | undefined;
        model?: {
            provider: string;
            modelId: string;
        } | undefined;
        tokens?: {
            total?: number | undefined;
            input?: number | undefined;
            output?: number | undefined;
            cacheRead?: number | undefined;
            reasoning?: number | undefined;
        } | undefined;
    }>;
    conversations: Record<string, {
        id: number;
        owner?: {
            conversationId: number;
            taskId: number;
        } | undefined;
        parent?: {
            at: number;
            conversationId: number;
        } | undefined;
    }>;
    receipts: {
        kind: string;
        conversationId: number;
        taskId: number;
        outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
        endedAt: number;
        error?: {
            message: string;
            code?: string | undefined;
        } | undefined;
        toolName?: string | undefined;
        owner?: number | undefined;
        startedAt?: number | undefined;
        durationMs?: number | undefined;
        targetHint?: string | undefined;
        tokens?: {
            total?: number | undefined;
            input?: number | undefined;
            output?: number | undefined;
            cacheRead?: number | undefined;
            reasoning?: number | undefined;
        } | undefined;
        isToolError?: boolean | undefined;
        preview?: string | undefined;
    }[];
    stats: {
        liveCount: number;
        terminalCount: number;
        totalCount: number;
    };
}, {
    version: 1;
    scope: {
        sessionId: string;
        rootConversationId: string;
        buildId: string;
    };
    observation: {
        epoch: string;
        revision: number;
        observedAt: number;
        completeness: "complete" | "limited";
    };
    nodes: Record<string, {
        kind: string;
        id: number;
        conversationId: number;
        background: boolean;
        abortRequested: boolean;
        state: {
            status: "pending";
            phase?: string | undefined;
        } | {
            status: "running";
            phase?: string | undefined;
        } | {
            status: "waiting";
            on: number[];
            phase?: string | undefined;
            policy?: "failFast" | "allSettled" | "all" | "first" | undefined;
        } | {
            status: "sleeping";
            until: number;
            phase?: string | undefined;
        } | {
            status: "completing";
            outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
        };
        label: string;
        thinkingLevel?: string | undefined;
        toolName?: string | undefined;
        owner?: number | undefined;
        blocked?: "missing_task" | "task_too_old" | "migration_failed" | "restart_limit" | undefined;
        startedAt?: number | undefined;
        endedAt?: number | undefined;
        durationMs?: number | undefined;
        targetHint?: string | undefined;
        model?: {
            provider: string;
            modelId: string;
        } | undefined;
        tokens?: {
            total?: number | undefined;
            input?: number | undefined;
            output?: number | undefined;
            cacheRead?: number | undefined;
            reasoning?: number | undefined;
        } | undefined;
    }>;
    conversations: Record<string, {
        id: number;
        owner?: {
            conversationId: number;
            taskId: number;
        } | undefined;
        parent?: {
            at: number;
            conversationId: number;
        } | undefined;
    }>;
    receipts: {
        kind: string;
        conversationId: number;
        taskId: number;
        outcome: "aborted" | "completed" | "failed" | "faulted" | "orphaned";
        endedAt: number;
        error?: {
            message: string;
            code?: string | undefined;
        } | undefined;
        toolName?: string | undefined;
        owner?: number | undefined;
        startedAt?: number | undefined;
        durationMs?: number | undefined;
        targetHint?: string | undefined;
        tokens?: {
            total?: number | undefined;
            input?: number | undefined;
            output?: number | undefined;
            cacheRead?: number | undefined;
            reasoning?: number | undefined;
        } | undefined;
        isToolError?: boolean | undefined;
        preview?: string | undefined;
    }[];
    stats: {
        liveCount: number;
        terminalCount: number;
        totalCount: number;
    };
}>;
