import { Redirect } from 'expo-router';

/** Profile now lives in You (the avatar on Today). Kept so old links still land. */
export default function ProfileRedirect() {
  return <Redirect href="/you" />;
}
