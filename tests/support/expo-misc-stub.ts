/** expo-constants / expo-file-system stand-ins: the export service only reads a version. */
export default { expoConfig: { version: 'test' } };
export class Directory {
  constructor(..._args: unknown[]) {}
  create(): void {}
}
export class File {
  constructor(..._args: unknown[]) {}
  write(): void {}
}
export const Paths = { cache: 'cache', document: 'document' };
