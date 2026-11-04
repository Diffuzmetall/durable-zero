// Negative fixture: dynamic import using no-substitution template literal
export async function loadVendor() {
  const mod = await import(`@earendil-works/pi-durable`);
  return mod;
}
