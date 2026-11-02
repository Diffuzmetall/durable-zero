import { z } from "zod";
import { messageSchemas } from "./wire-message.ts";
import { toolSchemas } from "./wire-tool.ts";
import { lifecycleSchemas } from "./wire-lifecycle.ts";
export const runnerEventSchema = z.discriminatedUnion("type", [...messageSchemas, ...toolSchemas, ...lifecycleSchemas]);
export const knownEventTypes = new Set(runnerEventSchema.options.map((schema) => schema.shape.type.value));
