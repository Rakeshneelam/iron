import { Redirect } from 'expo-router';

/** Now the Training tab of Settings. Kept so old links still land. */
export default function TrainingRedirect() {
  return <Redirect href={{ pathname: '/settings', params: { tab: 'training' } }} />;
}
