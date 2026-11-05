// Negative fixture: Forbidden adapter import
import { PiDurableEngine } from "@durable-zero/adapter-pi-durable";

export function getEngine(): PiDurableEngine | null {
  return null;
}
