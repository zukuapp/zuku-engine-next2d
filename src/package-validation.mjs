import { PackageValidationError, inspectPackageArchive } from './zip-policy.mjs';
import { assertManifestSchema } from './manifest-validator.mjs';
import { assertRuntimeManifest } from './runtime-contract.mjs';
export function inspectPackage(bytes, target = 'pc') {
  const archive = inspectPackageArchive(bytes, target);
  let manifest;
  try { manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(archive.manifest)); }
  catch { throw new PackageValidationError('jump.manifest.json must be valid UTF-8 JSON'); }
  assertManifestSchema(manifest);
  if (!manifest.platform[target]) throw new PackageValidationError(`manifest platform.${target} must be enabled`);
  if (manifest.format === 'wasm' && !archive.files.some(name => name.endsWith('.wasm'))) throw new PackageValidationError('WASM packages must include a .wasm file');
  if (manifest.swf_backend && manifest.format !== 'wasm') throw new PackageValidationError('swf_backend capability requires a WASM package');
  return {
    valid: true, target, size_bytes: bytes.byteLength,
    files: archive.files.sort(), manifest, capabilities: assertRuntimeManifest(manifest),
  };
}
