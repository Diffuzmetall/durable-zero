import { z } from "zod";
export declare const toolStartSchema: z.ZodObject<{
    parentRef: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    providerCheckpointId: z.ZodOptional<z.ZodString>;
    cumulativeUsage: z.ZodOptional<z.ZodObject<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
    aborted: z.ZodOptional<z.ZodBoolean>;
    stopReason: z.ZodOptional<z.ZodString>;
    errorMessage: z.ZodOptional<z.ZodString>;
} & {
    toolCallId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    toolName: z.ZodString;
} & {
    type: z.ZodLiteral<"tool_execution_start">;
    args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    parentRef: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    providerCheckpointId: z.ZodOptional<z.ZodString>;
    cumulativeUsage: z.ZodOptional<z.ZodObject<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
    aborted: z.ZodOptional<z.ZodBoolean>;
    stopReason: z.ZodOptional<z.ZodString>;
    errorMessage: z.ZodOptional<z.ZodString>;
} & {
    toolCallId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    toolName: z.ZodString;
} & {
    type: z.ZodLiteral<"tool_execution_start">;
    args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    parentRef: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    providerCheckpointId: z.ZodOptional<z.ZodString>;
    cumulativeUsage: z.ZodOptional<z.ZodObject<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
    aborted: z.ZodOptional<z.ZodBoolean>;
    stopReason: z.ZodOptional<z.ZodString>;
    errorMessage: z.ZodOptional<z.ZodString>;
} & {
    toolCallId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    toolName: z.ZodString;
} & {
    type: z.ZodLiteral<"tool_execution_start">;
    args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">>;
export declare const toolUpdateSchema: z.ZodObject<{
    parentRef: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    providerCheckpointId: z.ZodOptional<z.ZodString>;
    cumulativeUsage: z.ZodOptional<z.ZodObject<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
    aborted: z.ZodOptional<z.ZodBoolean>;
    stopReason: z.ZodOptional<z.ZodString>;
    errorMessage: z.ZodOptional<z.ZodString>;
} & {
    toolCallId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    toolName: z.ZodString;
} & {
    type: z.ZodLiteral<"tool_execution_update">;
    partialResult: z.ZodString;
    trimStart: z.ZodOptional<z.ZodNumber>;
    details: z.ZodOptional<z.ZodUnknown>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    parentRef: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    providerCheckpointId: z.ZodOptional<z.ZodString>;
    cumulativeUsage: z.ZodOptional<z.ZodObject<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
    aborted: z.ZodOptional<z.ZodBoolean>;
    stopReason: z.ZodOptional<z.ZodString>;
    errorMessage: z.ZodOptional<z.ZodString>;
} & {
    toolCallId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    toolName: z.ZodString;
} & {
    type: z.ZodLiteral<"tool_execution_update">;
    partialResult: z.ZodString;
    trimStart: z.ZodOptional<z.ZodNumber>;
    details: z.ZodOptional<z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    parentRef: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    providerCheckpointId: z.ZodOptional<z.ZodString>;
    cumulativeUsage: z.ZodOptional<z.ZodObject<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
    aborted: z.ZodOptional<z.ZodBoolean>;
    stopReason: z.ZodOptional<z.ZodString>;
    errorMessage: z.ZodOptional<z.ZodString>;
} & {
    toolCallId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    toolName: z.ZodString;
} & {
    type: z.ZodLiteral<"tool_execution_update">;
    partialResult: z.ZodString;
    trimStart: z.ZodOptional<z.ZodNumber>;
    details: z.ZodOptional<z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">>;
export declare const toolEndSchema: z.ZodObject<{
    parentRef: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    providerCheckpointId: z.ZodOptional<z.ZodString>;
    cumulativeUsage: z.ZodOptional<z.ZodObject<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
    aborted: z.ZodOptional<z.ZodBoolean>;
    stopReason: z.ZodOptional<z.ZodString>;
    errorMessage: z.ZodOptional<z.ZodString>;
} & {
    toolCallId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    toolName: z.ZodString;
} & {
    type: z.ZodLiteral<"tool_execution_end">;
    result: z.ZodString;
    isError: z.ZodBoolean;
    details: z.ZodOptional<z.ZodUnknown>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    parentRef: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    providerCheckpointId: z.ZodOptional<z.ZodString>;
    cumulativeUsage: z.ZodOptional<z.ZodObject<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
    aborted: z.ZodOptional<z.ZodBoolean>;
    stopReason: z.ZodOptional<z.ZodString>;
    errorMessage: z.ZodOptional<z.ZodString>;
} & {
    toolCallId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    toolName: z.ZodString;
} & {
    type: z.ZodLiteral<"tool_execution_end">;
    result: z.ZodString;
    isError: z.ZodBoolean;
    details: z.ZodOptional<z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    parentRef: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    providerCheckpointId: z.ZodOptional<z.ZodString>;
    cumulativeUsage: z.ZodOptional<z.ZodObject<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
    aborted: z.ZodOptional<z.ZodBoolean>;
    stopReason: z.ZodOptional<z.ZodString>;
    errorMessage: z.ZodOptional<z.ZodString>;
} & {
    toolCallId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    toolName: z.ZodString;
} & {
    type: z.ZodLiteral<"tool_execution_end">;
    result: z.ZodString;
    isError: z.ZodBoolean;
    details: z.ZodOptional<z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">>;
export declare const toolSchemas: readonly [z.ZodObject<{
    parentRef: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    providerCheckpointId: z.ZodOptional<z.ZodString>;
    cumulativeUsage: z.ZodOptional<z.ZodObject<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
    aborted: z.ZodOptional<z.ZodBoolean>;
    stopReason: z.ZodOptional<z.ZodString>;
    errorMessage: z.ZodOptional<z.ZodString>;
} & {
    toolCallId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    toolName: z.ZodString;
} & {
    type: z.ZodLiteral<"tool_execution_start">;
    args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    parentRef: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    providerCheckpointId: z.ZodOptional<z.ZodString>;
    cumulativeUsage: z.ZodOptional<z.ZodObject<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
    aborted: z.ZodOptional<z.ZodBoolean>;
    stopReason: z.ZodOptional<z.ZodString>;
    errorMessage: z.ZodOptional<z.ZodString>;
} & {
    toolCallId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    toolName: z.ZodString;
} & {
    type: z.ZodLiteral<"tool_execution_start">;
    args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    parentRef: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    providerCheckpointId: z.ZodOptional<z.ZodString>;
    cumulativeUsage: z.ZodOptional<z.ZodObject<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
    aborted: z.ZodOptional<z.ZodBoolean>;
    stopReason: z.ZodOptional<z.ZodString>;
    errorMessage: z.ZodOptional<z.ZodString>;
} & {
    toolCallId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    toolName: z.ZodString;
} & {
    type: z.ZodLiteral<"tool_execution_start">;
    args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
    parentRef: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    providerCheckpointId: z.ZodOptional<z.ZodString>;
    cumulativeUsage: z.ZodOptional<z.ZodObject<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
    aborted: z.ZodOptional<z.ZodBoolean>;
    stopReason: z.ZodOptional<z.ZodString>;
    errorMessage: z.ZodOptional<z.ZodString>;
} & {
    toolCallId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    toolName: z.ZodString;
} & {
    type: z.ZodLiteral<"tool_execution_update">;
    partialResult: z.ZodString;
    trimStart: z.ZodOptional<z.ZodNumber>;
    details: z.ZodOptional<z.ZodUnknown>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    parentRef: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    providerCheckpointId: z.ZodOptional<z.ZodString>;
    cumulativeUsage: z.ZodOptional<z.ZodObject<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
    aborted: z.ZodOptional<z.ZodBoolean>;
    stopReason: z.ZodOptional<z.ZodString>;
    errorMessage: z.ZodOptional<z.ZodString>;
} & {
    toolCallId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    toolName: z.ZodString;
} & {
    type: z.ZodLiteral<"tool_execution_update">;
    partialResult: z.ZodString;
    trimStart: z.ZodOptional<z.ZodNumber>;
    details: z.ZodOptional<z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    parentRef: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    providerCheckpointId: z.ZodOptional<z.ZodString>;
    cumulativeUsage: z.ZodOptional<z.ZodObject<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
    aborted: z.ZodOptional<z.ZodBoolean>;
    stopReason: z.ZodOptional<z.ZodString>;
    errorMessage: z.ZodOptional<z.ZodString>;
} & {
    toolCallId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    toolName: z.ZodString;
} & {
    type: z.ZodLiteral<"tool_execution_update">;
    partialResult: z.ZodString;
    trimStart: z.ZodOptional<z.ZodNumber>;
    details: z.ZodOptional<z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
    parentRef: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    providerCheckpointId: z.ZodOptional<z.ZodString>;
    cumulativeUsage: z.ZodOptional<z.ZodObject<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
    aborted: z.ZodOptional<z.ZodBoolean>;
    stopReason: z.ZodOptional<z.ZodString>;
    errorMessage: z.ZodOptional<z.ZodString>;
} & {
    toolCallId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    toolName: z.ZodString;
} & {
    type: z.ZodLiteral<"tool_execution_end">;
    result: z.ZodString;
    isError: z.ZodBoolean;
    details: z.ZodOptional<z.ZodUnknown>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    parentRef: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    providerCheckpointId: z.ZodOptional<z.ZodString>;
    cumulativeUsage: z.ZodOptional<z.ZodObject<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
    aborted: z.ZodOptional<z.ZodBoolean>;
    stopReason: z.ZodOptional<z.ZodString>;
    errorMessage: z.ZodOptional<z.ZodString>;
} & {
    toolCallId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    toolName: z.ZodString;
} & {
    type: z.ZodLiteral<"tool_execution_end">;
    result: z.ZodString;
    isError: z.ZodBoolean;
    details: z.ZodOptional<z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    parentRef: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    providerCheckpointId: z.ZodOptional<z.ZodString>;
    cumulativeUsage: z.ZodOptional<z.ZodObject<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        totalTokens: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheWriteInputTokens: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
    aborted: z.ZodOptional<z.ZodBoolean>;
    stopReason: z.ZodOptional<z.ZodString>;
    errorMessage: z.ZodOptional<z.ZodString>;
} & {
    toolCallId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    toolName: z.ZodString;
} & {
    type: z.ZodLiteral<"tool_execution_end">;
    result: z.ZodString;
    isError: z.ZodBoolean;
    details: z.ZodOptional<z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">>];
export type ToolExecutionStartEvent = z.infer<typeof toolStartSchema>;
export type ToolExecutionUpdateEvent = z.infer<typeof toolUpdateSchema>;
export type ToolExecutionEndEvent = z.infer<typeof toolEndSchema>;
