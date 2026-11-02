import { z } from "zod";
export declare const piPathStatusSchema: z.ZodObject<{
    path: z.ZodString;
    exists: z.ZodBoolean;
    type: z.ZodEnum<["file", "directory"]>;
    required: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    path: string;
    exists: boolean;
    type: "file" | "directory";
    required: boolean;
}, {
    path: string;
    exists: boolean;
    type: "file" | "directory";
    required: boolean;
}>;
export type PiPathStatus = z.infer<typeof piPathStatusSchema>;
export declare const extensionDiagnosticSchema: z.ZodObject<{
    path: z.ZodString;
    resolvedPath: z.ZodString;
    tools: z.ZodArray<z.ZodString, "many">;
    commands: z.ZodArray<z.ZodString, "many">;
    supportedHooks: z.ZodArray<z.ZodString, "many">;
    unsupportedHooks: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    path: string;
    resolvedPath: string;
    tools: string[];
    commands: string[];
    supportedHooks: string[];
    unsupportedHooks: string[];
}, {
    path: string;
    resolvedPath: string;
    tools: string[];
    commands: string[];
    supportedHooks: string[];
    unsupportedHooks: string[];
}>;
export type ExtensionDiagnostic = z.infer<typeof extensionDiagnosticSchema>;
export declare const piDiagnosticsReportSchema: z.ZodObject<{
    version: z.ZodString;
    durableVersion: z.ZodString;
    agentDir: z.ZodString;
    paths: z.ZodRecord<z.ZodString, z.ZodObject<{
        path: z.ZodString;
        exists: z.ZodBoolean;
        type: z.ZodEnum<["file", "directory"]>;
        required: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        path: string;
        exists: boolean;
        type: "file" | "directory";
        required: boolean;
    }, {
        path: string;
        exists: boolean;
        type: "file" | "directory";
        required: boolean;
    }>>;
    settings: z.ZodObject<{
        defaultProvider: z.ZodOptional<z.ZodString>;
        defaultModel: z.ZodOptional<z.ZodString>;
        thinkingLevel: z.ZodOptional<z.ZodString>;
        packages: z.ZodArray<z.ZodString, "many">;
        extensions: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        packages: string[];
        extensions: string[];
        defaultProvider?: string | undefined;
        defaultModel?: string | undefined;
        thinkingLevel?: string | undefined;
    }, {
        packages: string[];
        extensions: string[];
        defaultProvider?: string | undefined;
        defaultModel?: string | undefined;
        thinkingLevel?: string | undefined;
    }>;
    models: z.ZodObject<{
        total: z.ZodNumber;
        providers: z.ZodArray<z.ZodString, "many">;
        defaultModelAvailable: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        total: number;
        providers: string[];
        defaultModelAvailable: boolean;
    }, {
        total: number;
        providers: string[];
        defaultModelAvailable: boolean;
    }>;
    extensions: z.ZodObject<{
        total: z.ZodNumber;
        errors: z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            error: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            path: string;
            error: string;
        }, {
            path: string;
            error: string;
        }>, "many">;
        warnings: z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            warning: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            path: string;
            warning: string;
        }, {
            path: string;
            warning: string;
        }>, "many">;
        items: z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            resolvedPath: z.ZodString;
            tools: z.ZodArray<z.ZodString, "many">;
            commands: z.ZodArray<z.ZodString, "many">;
            supportedHooks: z.ZodArray<z.ZodString, "many">;
            unsupportedHooks: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            path: string;
            resolvedPath: string;
            tools: string[];
            commands: string[];
            supportedHooks: string[];
            unsupportedHooks: string[];
        }, {
            path: string;
            resolvedPath: string;
            tools: string[];
            commands: string[];
            supportedHooks: string[];
            unsupportedHooks: string[];
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        total: number;
        errors: {
            path: string;
            error: string;
        }[];
        warnings: {
            path: string;
            warning: string;
        }[];
        items: {
            path: string;
            resolvedPath: string;
            tools: string[];
            commands: string[];
            supportedHooks: string[];
            unsupportedHooks: string[];
        }[];
    }, {
        total: number;
        errors: {
            path: string;
            error: string;
        }[];
        warnings: {
            path: string;
            warning: string;
        }[];
        items: {
            path: string;
            resolvedPath: string;
            tools: string[];
            commands: string[];
            supportedHooks: string[];
            unsupportedHooks: string[];
        }[];
    }>;
    skills: z.ZodObject<{
        total: z.ZodNumber;
        sample: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        total: number;
        sample: string[];
    }, {
        total: number;
        sample: string[];
    }>;
    tools: z.ZodObject<{
        total: z.ZodNumber;
        system: z.ZodArray<z.ZodString, "many">;
        custom: z.ZodArray<z.ZodString, "many">;
        mcp: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        custom: string[];
        total: number;
        system: string[];
        mcp: string[];
    }, {
        custom: string[];
        total: number;
        system: string[];
        mcp: string[];
    }>;
    status: z.ZodEnum<["healthy", "warning", "error"]>;
    summary: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "error" | "warning" | "healthy";
    tools: {
        custom: string[];
        total: number;
        system: string[];
        mcp: string[];
    };
    version: string;
    durableVersion: string;
    agentDir: string;
    paths: Record<string, {
        path: string;
        exists: boolean;
        type: "file" | "directory";
        required: boolean;
    }>;
    settings: {
        packages: string[];
        extensions: string[];
        defaultProvider?: string | undefined;
        defaultModel?: string | undefined;
        thinkingLevel?: string | undefined;
    };
    extensions: {
        total: number;
        errors: {
            path: string;
            error: string;
        }[];
        warnings: {
            path: string;
            warning: string;
        }[];
        items: {
            path: string;
            resolvedPath: string;
            tools: string[];
            commands: string[];
            supportedHooks: string[];
            unsupportedHooks: string[];
        }[];
    };
    models: {
        total: number;
        providers: string[];
        defaultModelAvailable: boolean;
    };
    skills: {
        total: number;
        sample: string[];
    };
    summary: string;
}, {
    status: "error" | "warning" | "healthy";
    tools: {
        custom: string[];
        total: number;
        system: string[];
        mcp: string[];
    };
    version: string;
    durableVersion: string;
    agentDir: string;
    paths: Record<string, {
        path: string;
        exists: boolean;
        type: "file" | "directory";
        required: boolean;
    }>;
    settings: {
        packages: string[];
        extensions: string[];
        defaultProvider?: string | undefined;
        defaultModel?: string | undefined;
        thinkingLevel?: string | undefined;
    };
    extensions: {
        total: number;
        errors: {
            path: string;
            error: string;
        }[];
        warnings: {
            path: string;
            warning: string;
        }[];
        items: {
            path: string;
            resolvedPath: string;
            tools: string[];
            commands: string[];
            supportedHooks: string[];
            unsupportedHooks: string[];
        }[];
    };
    models: {
        total: number;
        providers: string[];
        defaultModelAvailable: boolean;
    };
    skills: {
        total: number;
        sample: string[];
    };
    summary: string;
}>;
export type PiDiagnosticsReport = z.infer<typeof piDiagnosticsReportSchema>;
