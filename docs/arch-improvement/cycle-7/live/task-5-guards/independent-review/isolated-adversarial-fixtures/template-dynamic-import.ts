
export async function loadVendor() {
  const mod = await import(`@earendil-works/pi-durable`);
  return mod;
}
