import { asPackageBytes, PackageValidationError } from './zip-policy.mjs';
import { inspectPackage } from './package-validation.mjs';
export { PACKAGE_LIMITS } from './zip-policy.mjs';
export async function validatePackageBytes(bytes, target = 'pc') {
  bytes = asPackageBytes(bytes);
  const result = inspectPackage(bytes, target);
  if (!globalThis.crypto?.subtle) throw new PackageValidationError('SHA-256 requires WebCrypto in a secure context');
  let sha256;
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    sha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  }
  return { ...result, sha256 };
}
