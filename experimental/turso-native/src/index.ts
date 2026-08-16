/**
 * Experimental Turso-native compiler spike.
 *
 * This is not a stable package. Graduation is gated on upstream index-method
 * stability in Phase 15.
 */
export { tursoNativeBackend } from "./backend.js";
export { emitTursoMatch } from "./emit.js";
export { escapeTursoLiteral, emitTursoPhrase, emitTursoTerm } from "./escape.js";
export { compileTursoDdl, compileTursoPhysicalManifest } from "./manifest.js";
export {
  TURSO_NATIVE_BASE_CAPABILITIES,
  TURSO_NATIVE_SCORE,
  TURSO_NATIVE_VISIBILITY,
} from "./semantics.js";
export { TURSO_NATIVE_UPSTREAM_STATUS } from "./status.js";
