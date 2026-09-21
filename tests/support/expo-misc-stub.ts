/** expo-constants / expo-file-system stand-ins: the export service only reads a version. */
export default { expoConfig: { version: 'test' } };
export class Directory {
  create(): void {}
}
export class File {
  write(): void {}
}
export const Paths = { cache: 'cache', document: 'document' };
