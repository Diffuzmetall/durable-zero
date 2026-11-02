import { z } from "zod";
export declare const conversationIdSchema: z.ZodUnion<[z.ZodNumber, z.ZodString]>;
export declare const cumulativeUsageSchema: z.ZodObject<{
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
}, z.ZodTypeAny, "passthrough">>;
export type CumulativeUsageMetrics = z.infer<typeof cumulativeUsageSchema>;
export declare const wireContextSchema: z.ZodObject<{
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
}, z.ZodTypeAny, "passthrough">>;
