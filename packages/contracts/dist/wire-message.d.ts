import { z } from "zod";
export declare const assistantUsageSchema: z.ZodObject<{
    input: z.ZodOptional<z.ZodNumber>;
    output: z.ZodOptional<z.ZodNumber>;
    cacheRead: z.ZodOptional<z.ZodNumber>;
    cacheWrite: z.ZodOptional<z.ZodNumber>;
    totalTokens: z.ZodOptional<z.ZodNumber>;
    cost: z.ZodOptional<z.ZodObject<{
        input: z.ZodOptional<z.ZodNumber>;
        output: z.ZodOptional<z.ZodNumber>;
        cacheRead: z.ZodOptional<z.ZodNumber>;
        cacheWrite: z.ZodOptional<z.ZodNumber>;
        total: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        input: z.ZodOptional<z.ZodNumber>;
        output: z.ZodOptional<z.ZodNumber>;
        cacheRead: z.ZodOptional<z.ZodNumber>;
        cacheWrite: z.ZodOptional<z.ZodNumber>;
        total: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        input: z.ZodOptional<z.ZodNumber>;
        output: z.ZodOptional<z.ZodNumber>;
        cacheRead: z.ZodOptional<z.ZodNumber>;
        cacheWrite: z.ZodOptional<z.ZodNumber>;
        total: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    input: z.ZodOptional<z.ZodNumber>;
    output: z.ZodOptional<z.ZodNumber>;
    cacheRead: z.ZodOptional<z.ZodNumber>;
    cacheWrite: z.ZodOptional<z.ZodNumber>;
    totalTokens: z.ZodOptional<z.ZodNumber>;
    cost: z.ZodOptional<z.ZodObject<{
        input: z.ZodOptional<z.ZodNumber>;
        output: z.ZodOptional<z.ZodNumber>;
        cacheRead: z.ZodOptional<z.ZodNumber>;
        cacheWrite: z.ZodOptional<z.ZodNumber>;
        total: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        input: z.ZodOptional<z.ZodNumber>;
        output: z.ZodOptional<z.ZodNumber>;
        cacheRead: z.ZodOptional<z.ZodNumber>;
        cacheWrite: z.ZodOptional<z.ZodNumber>;
        total: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        input: z.ZodOptional<z.ZodNumber>;
        output: z.ZodOptional<z.ZodNumber>;
        cacheRead: z.ZodOptional<z.ZodNumber>;
        cacheWrite: z.ZodOptional<z.ZodNumber>;
        total: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    input: z.ZodOptional<z.ZodNumber>;
    output: z.ZodOptional<z.ZodNumber>;
    cacheRead: z.ZodOptional<z.ZodNumber>;
    cacheWrite: z.ZodOptional<z.ZodNumber>;
    totalTokens: z.ZodOptional<z.ZodNumber>;
    cost: z.ZodOptional<z.ZodObject<{
        input: z.ZodOptional<z.ZodNumber>;
        output: z.ZodOptional<z.ZodNumber>;
        cacheRead: z.ZodOptional<z.ZodNumber>;
        cacheWrite: z.ZodOptional<z.ZodNumber>;
        total: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        input: z.ZodOptional<z.ZodNumber>;
        output: z.ZodOptional<z.ZodNumber>;
        cacheRead: z.ZodOptional<z.ZodNumber>;
        cacheWrite: z.ZodOptional<z.ZodNumber>;
        total: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        input: z.ZodOptional<z.ZodNumber>;
        output: z.ZodOptional<z.ZodNumber>;
        cacheRead: z.ZodOptional<z.ZodNumber>;
        cacheWrite: z.ZodOptional<z.ZodNumber>;
        total: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
}, z.ZodTypeAny, "passthrough">>;
export type AssistantMessageUsage = z.infer<typeof assistantUsageSchema>;
export declare const assistantMessageSchema: z.ZodObject<{
    role: z.ZodLiteral<"assistant">;
    content: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"text">;
        text: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "text";
        text: string;
    }, {
        type: "text";
        text: string;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"thinking">;
        thinking: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "thinking";
        thinking: string;
    }, {
        type: "thinking";
        thinking: string;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"toolCall">;
        id: z.ZodString;
        name: z.ZodString;
        arguments: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        type: "toolCall";
        id: string;
        name: string;
        arguments: Record<string, unknown>;
    }, {
        type: "toolCall";
        id: string;
        name: string;
        arguments: Record<string, unknown>;
    }>]>, "many">;
    stopReason: z.ZodOptional<z.ZodEnum<["stop", "toolUse", "length", "aborted", "error"]>>;
    errorMessage: z.ZodOptional<z.ZodString>;
    usage: z.ZodOptional<z.ZodObject<{
        input: z.ZodOptional<z.ZodNumber>;
        output: z.ZodOptional<z.ZodNumber>;
        cacheRead: z.ZodOptional<z.ZodNumber>;
        cacheWrite: z.ZodOptional<z.ZodNumber>;
        totalTokens: z.ZodOptional<z.ZodNumber>;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        input: z.ZodOptional<z.ZodNumber>;
        output: z.ZodOptional<z.ZodNumber>;
        cacheRead: z.ZodOptional<z.ZodNumber>;
        cacheWrite: z.ZodOptional<z.ZodNumber>;
        totalTokens: z.ZodOptional<z.ZodNumber>;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        input: z.ZodOptional<z.ZodNumber>;
        output: z.ZodOptional<z.ZodNumber>;
        cacheRead: z.ZodOptional<z.ZodNumber>;
        cacheWrite: z.ZodOptional<z.ZodNumber>;
        totalTokens: z.ZodOptional<z.ZodNumber>;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
    }, z.ZodTypeAny, "passthrough">>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    role: z.ZodLiteral<"assistant">;
    content: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"text">;
        text: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "text";
        text: string;
    }, {
        type: "text";
        text: string;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"thinking">;
        thinking: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "thinking";
        thinking: string;
    }, {
        type: "thinking";
        thinking: string;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"toolCall">;
        id: z.ZodString;
        name: z.ZodString;
        arguments: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        type: "toolCall";
        id: string;
        name: string;
        arguments: Record<string, unknown>;
    }, {
        type: "toolCall";
        id: string;
        name: string;
        arguments: Record<string, unknown>;
    }>]>, "many">;
    stopReason: z.ZodOptional<z.ZodEnum<["stop", "toolUse", "length", "aborted", "error"]>>;
    errorMessage: z.ZodOptional<z.ZodString>;
    usage: z.ZodOptional<z.ZodObject<{
        input: z.ZodOptional<z.ZodNumber>;
        output: z.ZodOptional<z.ZodNumber>;
        cacheRead: z.ZodOptional<z.ZodNumber>;
        cacheWrite: z.ZodOptional<z.ZodNumber>;
        totalTokens: z.ZodOptional<z.ZodNumber>;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        input: z.ZodOptional<z.ZodNumber>;
        output: z.ZodOptional<z.ZodNumber>;
        cacheRead: z.ZodOptional<z.ZodNumber>;
        cacheWrite: z.ZodOptional<z.ZodNumber>;
        totalTokens: z.ZodOptional<z.ZodNumber>;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        input: z.ZodOptional<z.ZodNumber>;
        output: z.ZodOptional<z.ZodNumber>;
        cacheRead: z.ZodOptional<z.ZodNumber>;
        cacheWrite: z.ZodOptional<z.ZodNumber>;
        totalTokens: z.ZodOptional<z.ZodNumber>;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
    }, z.ZodTypeAny, "passthrough">>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    role: z.ZodLiteral<"assistant">;
    content: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"text">;
        text: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "text";
        text: string;
    }, {
        type: "text";
        text: string;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"thinking">;
        thinking: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "thinking";
        thinking: string;
    }, {
        type: "thinking";
        thinking: string;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"toolCall">;
        id: z.ZodString;
        name: z.ZodString;
        arguments: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        type: "toolCall";
        id: string;
        name: string;
        arguments: Record<string, unknown>;
    }, {
        type: "toolCall";
        id: string;
        name: string;
        arguments: Record<string, unknown>;
    }>]>, "many">;
    stopReason: z.ZodOptional<z.ZodEnum<["stop", "toolUse", "length", "aborted", "error"]>>;
    errorMessage: z.ZodOptional<z.ZodString>;
    usage: z.ZodOptional<z.ZodObject<{
        input: z.ZodOptional<z.ZodNumber>;
        output: z.ZodOptional<z.ZodNumber>;
        cacheRead: z.ZodOptional<z.ZodNumber>;
        cacheWrite: z.ZodOptional<z.ZodNumber>;
        totalTokens: z.ZodOptional<z.ZodNumber>;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        input: z.ZodOptional<z.ZodNumber>;
        output: z.ZodOptional<z.ZodNumber>;
        cacheRead: z.ZodOptional<z.ZodNumber>;
        cacheWrite: z.ZodOptional<z.ZodNumber>;
        totalTokens: z.ZodOptional<z.ZodNumber>;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        input: z.ZodOptional<z.ZodNumber>;
        output: z.ZodOptional<z.ZodNumber>;
        cacheRead: z.ZodOptional<z.ZodNumber>;
        cacheWrite: z.ZodOptional<z.ZodNumber>;
        totalTokens: z.ZodOptional<z.ZodNumber>;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
    }, z.ZodTypeAny, "passthrough">>>;
}, z.ZodTypeAny, "passthrough">>;
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;
export declare const messageUpdateSchema: z.ZodObject<{
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
    type: z.ZodLiteral<"message_update">;
    assistantMessageEvent: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"thinking_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"thinking_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"thinking_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"thinking_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"thinking_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"thinking_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"text_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"text_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"text_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"thinking_start">;
        contentIndex: z.ZodNumber;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"thinking_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"thinking_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"text_start">;
        contentIndex: z.ZodNumber;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"text_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"text_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"text_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"text_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"text_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>]>;
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
    type: z.ZodLiteral<"message_update">;
    assistantMessageEvent: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"thinking_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"thinking_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"thinking_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"thinking_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"thinking_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"thinking_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"text_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"text_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"text_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"thinking_start">;
        contentIndex: z.ZodNumber;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"thinking_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"thinking_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"text_start">;
        contentIndex: z.ZodNumber;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"text_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"text_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"text_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"text_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"text_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>]>;
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
    type: z.ZodLiteral<"message_update">;
    assistantMessageEvent: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"thinking_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"thinking_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"thinking_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"thinking_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"thinking_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"thinking_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"text_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"text_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"text_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"thinking_start">;
        contentIndex: z.ZodNumber;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"thinking_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"thinking_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"text_start">;
        contentIndex: z.ZodNumber;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"text_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"text_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"text_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"text_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"text_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>]>;
}, z.ZodTypeAny, "passthrough">>;
export declare const messageSchemas: readonly [z.ZodObject<{
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
    type: z.ZodLiteral<"message_update">;
    assistantMessageEvent: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"thinking_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"thinking_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"thinking_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"thinking_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"thinking_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"thinking_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"text_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"text_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"text_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"thinking_start">;
        contentIndex: z.ZodNumber;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"thinking_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"thinking_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"text_start">;
        contentIndex: z.ZodNumber;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"text_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"text_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"text_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"text_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"text_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>]>;
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
    type: z.ZodLiteral<"message_update">;
    assistantMessageEvent: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"thinking_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"thinking_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"thinking_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"thinking_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"thinking_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"thinking_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"text_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"text_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"text_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"thinking_start">;
        contentIndex: z.ZodNumber;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"thinking_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"thinking_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"text_start">;
        contentIndex: z.ZodNumber;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"text_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"text_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"text_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"text_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"text_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>]>;
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
    type: z.ZodLiteral<"message_update">;
    assistantMessageEvent: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"thinking_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"thinking_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"thinking_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"thinking_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"thinking_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"thinking_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"text_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"text_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"text_delta">;
        contentIndex: z.ZodNumber;
        delta: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"thinking_start">;
        contentIndex: z.ZodNumber;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"thinking_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"thinking_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"text_start">;
        contentIndex: z.ZodNumber;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"text_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"text_start">;
        contentIndex: z.ZodNumber;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        type: z.ZodLiteral<"text_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodLiteral<"text_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodLiteral<"text_end">;
        contentIndex: z.ZodNumber;
        content: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>]>;
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
    type: z.ZodLiteral<"message_end">;
    message: z.ZodObject<{
        role: z.ZodLiteral<"assistant">;
        content: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
            type: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "text";
            text: string;
        }, {
            type: "text";
            text: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"thinking">;
            thinking: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "thinking";
            thinking: string;
        }, {
            type: "thinking";
            thinking: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"toolCall">;
            id: z.ZodString;
            name: z.ZodString;
            arguments: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "strip", z.ZodTypeAny, {
            type: "toolCall";
            id: string;
            name: string;
            arguments: Record<string, unknown>;
        }, {
            type: "toolCall";
            id: string;
            name: string;
            arguments: Record<string, unknown>;
        }>]>, "many">;
        stopReason: z.ZodOptional<z.ZodEnum<["stop", "toolUse", "length", "aborted", "error"]>>;
        errorMessage: z.ZodOptional<z.ZodString>;
        usage: z.ZodOptional<z.ZodObject<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        role: z.ZodLiteral<"assistant">;
        content: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
            type: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "text";
            text: string;
        }, {
            type: "text";
            text: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"thinking">;
            thinking: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "thinking";
            thinking: string;
        }, {
            type: "thinking";
            thinking: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"toolCall">;
            id: z.ZodString;
            name: z.ZodString;
            arguments: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "strip", z.ZodTypeAny, {
            type: "toolCall";
            id: string;
            name: string;
            arguments: Record<string, unknown>;
        }, {
            type: "toolCall";
            id: string;
            name: string;
            arguments: Record<string, unknown>;
        }>]>, "many">;
        stopReason: z.ZodOptional<z.ZodEnum<["stop", "toolUse", "length", "aborted", "error"]>>;
        errorMessage: z.ZodOptional<z.ZodString>;
        usage: z.ZodOptional<z.ZodObject<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        role: z.ZodLiteral<"assistant">;
        content: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
            type: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "text";
            text: string;
        }, {
            type: "text";
            text: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"thinking">;
            thinking: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "thinking";
            thinking: string;
        }, {
            type: "thinking";
            thinking: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"toolCall">;
            id: z.ZodString;
            name: z.ZodString;
            arguments: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "strip", z.ZodTypeAny, {
            type: "toolCall";
            id: string;
            name: string;
            arguments: Record<string, unknown>;
        }, {
            type: "toolCall";
            id: string;
            name: string;
            arguments: Record<string, unknown>;
        }>]>, "many">;
        stopReason: z.ZodOptional<z.ZodEnum<["stop", "toolUse", "length", "aborted", "error"]>>;
        errorMessage: z.ZodOptional<z.ZodString>;
        usage: z.ZodOptional<z.ZodObject<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">>>;
    }, z.ZodTypeAny, "passthrough">>;
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
    type: z.ZodLiteral<"message_end">;
    message: z.ZodObject<{
        role: z.ZodLiteral<"assistant">;
        content: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
            type: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "text";
            text: string;
        }, {
            type: "text";
            text: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"thinking">;
            thinking: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "thinking";
            thinking: string;
        }, {
            type: "thinking";
            thinking: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"toolCall">;
            id: z.ZodString;
            name: z.ZodString;
            arguments: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "strip", z.ZodTypeAny, {
            type: "toolCall";
            id: string;
            name: string;
            arguments: Record<string, unknown>;
        }, {
            type: "toolCall";
            id: string;
            name: string;
            arguments: Record<string, unknown>;
        }>]>, "many">;
        stopReason: z.ZodOptional<z.ZodEnum<["stop", "toolUse", "length", "aborted", "error"]>>;
        errorMessage: z.ZodOptional<z.ZodString>;
        usage: z.ZodOptional<z.ZodObject<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        role: z.ZodLiteral<"assistant">;
        content: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
            type: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "text";
            text: string;
        }, {
            type: "text";
            text: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"thinking">;
            thinking: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "thinking";
            thinking: string;
        }, {
            type: "thinking";
            thinking: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"toolCall">;
            id: z.ZodString;
            name: z.ZodString;
            arguments: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "strip", z.ZodTypeAny, {
            type: "toolCall";
            id: string;
            name: string;
            arguments: Record<string, unknown>;
        }, {
            type: "toolCall";
            id: string;
            name: string;
            arguments: Record<string, unknown>;
        }>]>, "many">;
        stopReason: z.ZodOptional<z.ZodEnum<["stop", "toolUse", "length", "aborted", "error"]>>;
        errorMessage: z.ZodOptional<z.ZodString>;
        usage: z.ZodOptional<z.ZodObject<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        role: z.ZodLiteral<"assistant">;
        content: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
            type: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "text";
            text: string;
        }, {
            type: "text";
            text: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"thinking">;
            thinking: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "thinking";
            thinking: string;
        }, {
            type: "thinking";
            thinking: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"toolCall">;
            id: z.ZodString;
            name: z.ZodString;
            arguments: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "strip", z.ZodTypeAny, {
            type: "toolCall";
            id: string;
            name: string;
            arguments: Record<string, unknown>;
        }, {
            type: "toolCall";
            id: string;
            name: string;
            arguments: Record<string, unknown>;
        }>]>, "many">;
        stopReason: z.ZodOptional<z.ZodEnum<["stop", "toolUse", "length", "aborted", "error"]>>;
        errorMessage: z.ZodOptional<z.ZodString>;
        usage: z.ZodOptional<z.ZodObject<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">>>;
    }, z.ZodTypeAny, "passthrough">>;
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
    type: z.ZodLiteral<"message_end">;
    message: z.ZodObject<{
        role: z.ZodLiteral<"assistant">;
        content: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
            type: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "text";
            text: string;
        }, {
            type: "text";
            text: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"thinking">;
            thinking: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "thinking";
            thinking: string;
        }, {
            type: "thinking";
            thinking: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"toolCall">;
            id: z.ZodString;
            name: z.ZodString;
            arguments: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "strip", z.ZodTypeAny, {
            type: "toolCall";
            id: string;
            name: string;
            arguments: Record<string, unknown>;
        }, {
            type: "toolCall";
            id: string;
            name: string;
            arguments: Record<string, unknown>;
        }>]>, "many">;
        stopReason: z.ZodOptional<z.ZodEnum<["stop", "toolUse", "length", "aborted", "error"]>>;
        errorMessage: z.ZodOptional<z.ZodString>;
        usage: z.ZodOptional<z.ZodObject<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        role: z.ZodLiteral<"assistant">;
        content: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
            type: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "text";
            text: string;
        }, {
            type: "text";
            text: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"thinking">;
            thinking: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "thinking";
            thinking: string;
        }, {
            type: "thinking";
            thinking: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"toolCall">;
            id: z.ZodString;
            name: z.ZodString;
            arguments: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "strip", z.ZodTypeAny, {
            type: "toolCall";
            id: string;
            name: string;
            arguments: Record<string, unknown>;
        }, {
            type: "toolCall";
            id: string;
            name: string;
            arguments: Record<string, unknown>;
        }>]>, "many">;
        stopReason: z.ZodOptional<z.ZodEnum<["stop", "toolUse", "length", "aborted", "error"]>>;
        errorMessage: z.ZodOptional<z.ZodString>;
        usage: z.ZodOptional<z.ZodObject<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        role: z.ZodLiteral<"assistant">;
        content: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
            type: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "text";
            text: string;
        }, {
            type: "text";
            text: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"thinking">;
            thinking: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "thinking";
            thinking: string;
        }, {
            type: "thinking";
            thinking: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"toolCall">;
            id: z.ZodString;
            name: z.ZodString;
            arguments: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "strip", z.ZodTypeAny, {
            type: "toolCall";
            id: string;
            name: string;
            arguments: Record<string, unknown>;
        }, {
            type: "toolCall";
            id: string;
            name: string;
            arguments: Record<string, unknown>;
        }>]>, "many">;
        stopReason: z.ZodOptional<z.ZodEnum<["stop", "toolUse", "length", "aborted", "error"]>>;
        errorMessage: z.ZodOptional<z.ZodString>;
        usage: z.ZodOptional<z.ZodObject<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            input: z.ZodOptional<z.ZodNumber>;
            output: z.ZodOptional<z.ZodNumber>;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cost: z.ZodOptional<z.ZodObject<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                input: z.ZodOptional<z.ZodNumber>;
                output: z.ZodOptional<z.ZodNumber>;
                cacheRead: z.ZodOptional<z.ZodNumber>;
                cacheWrite: z.ZodOptional<z.ZodNumber>;
                total: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">>>;
    }, z.ZodTypeAny, "passthrough">>;
}, z.ZodTypeAny, "passthrough">>];
export type MessageUpdateEvent = z.infer<typeof messageUpdateSchema>;
