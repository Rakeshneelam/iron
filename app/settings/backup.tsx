import { Redirect } from 'expo-router';

/** Now the Data tab of Settings. Kept so old links and the backup reminder still land. */
export default function BackupRedirect() {
  return <Redirect href={{ pathname: '/settings', params: { tab: 'data' } }} />;
}
