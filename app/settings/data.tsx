import { Redirect } from 'expo-router';

/** Now a page of You. Kept so old links still land. */
export default function DataRedirect() {
  return <Redirect href="/you/backup" />;
}
