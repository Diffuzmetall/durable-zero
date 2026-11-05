// Positive fixture: Allowed contracts, zod, and local port
import type { PromptAdmissionReceipt } from "@durable-zero/contracts";
import { z } from "zod";
import type { CleanDomainPort } from "./clean-domain-port.ts";

export const inputSchema = z.object({
  id: z.string().min(1),
});

export class CleanService implements CleanDomainPort {
  async execute(id: string): Promise<string> {
    const valid = inputSchema.parse({ id });
    return valid.id;
  }
}
