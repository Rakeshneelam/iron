import { Redirect } from 'expo-router';

/** Now a page of You. Kept so the backup reminder and old links still land. */
export default function BackupRedirect() {
  return <Redirect href="/you/backup" />;
}
