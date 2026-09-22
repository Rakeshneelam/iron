import { Redirect } from 'expo-router';

/** Now the Profile tab of Settings. Kept so Body, Food and old links still land. */
export default function ProfileRedirect() {
  return <Redirect href={{ pathname: '/settings', params: { tab: 'profile' } }} />;
}
