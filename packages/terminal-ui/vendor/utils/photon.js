// Node loads the dependency's own WASM asset. Never patch the filesystem or global module state.
let photon;
export function loadPhoton() {
    return photon ??= import("@silvia-odwyer/photon-node");
}
