import { Redirect } from 'expo-router';

/** Now the Data tab of Settings. Kept so old links still land. */
export default function DataRedirect() {
  return <Redirect href={{ pathname: '/settings', params: { tab: 'data' } }} />;
}
