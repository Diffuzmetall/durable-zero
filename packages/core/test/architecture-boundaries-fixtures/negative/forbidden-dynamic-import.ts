// Negative fixture: Forbidden literal dynamic import of adapter
export async function loadAdapter() {
  const mod = await import("@durable-zero/adapter-codemode");
  return mod;
}
