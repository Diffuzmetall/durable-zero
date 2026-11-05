// Negative fixture: Forbidden vendor import
import { Harness } from "@earendil-works/pi-durable";

export function useHarness(): Harness | null {
  return null;
}
