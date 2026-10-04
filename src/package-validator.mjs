import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { PACKAGE_LIMITS, asPackageBytes, PackageValidationError } from './zip-policy.mjs';
import { inspectPackage } from './package-validation.mjs';
export { PACKAGE_LIMITS };
export async function validatePackage(filePath, target = 'pc') {
  if (!Object.hasOwn(PACKAGE_LIMITS, target)) throw new PackageValidationError(`unsupported target: ${target}`);
  // Nonblocking open also allows the regular-file check to reject FIFOs without hanging.
  const file = await open(filePath, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new PackageValidationError('package path must refer to a regular file');
    if (stat.size > PACKAGE_LIMITS[target]) throw new PackageValidationError(`package exceeds ${target} limit (${PACKAGE_LIMITS[target]} bytes)`);
    if (stat.size < 22) throw new PackageValidationError('package must be a valid ZIP archive');
    const bytes = new Uint8Array(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await file.read(bytes, offset, bytes.length - offset, offset);
      if (!result.bytesRead) throw new PackageValidationError('package changed or was truncated while reading');
      offset += result.bytesRead;
    }
    const extra = new Uint8Array(1);
    if ((await file.read(extra, 0, 1, offset)).bytesRead || (await file.stat()).size !== stat.size) throw new PackageValidationError('package changed while reading');
    return validatePackageBytes(bytes, target);
  } finally { await file.close(); }
}
export function validatePackageBytes(bytes, target = 'pc') {
  bytes = asPackageBytes(bytes);
  const result = inspectPackage(bytes, target);
  return { ...result, sha256: createHash('sha256').update(bytes).digest('hex') };
}
