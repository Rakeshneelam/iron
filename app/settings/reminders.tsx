import { Redirect } from 'expo-router';

/** Now the Alerts tab of Settings. Kept so Water and old links still land. */
export default function RemindersRedirect() {
  return <Redirect href={{ pathname: '/settings', params: { tab: 'alerts' } }} />;
}
