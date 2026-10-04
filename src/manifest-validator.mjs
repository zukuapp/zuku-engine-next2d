import validateManifest from './manifest-validator.generated.mjs';
export function assertManifestSchema(manifest) {
  if (!validateManifest(manifest)) {
    const issues = validateManifest.errors.map(issue => `${issue.instancePath || '/'}: ${issue.message}`).join('; ');
    throw new Error(`jump.manifest.json schema invalid: ${issues}`);
  }
  return manifest;
}
