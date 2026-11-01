import { Redirect } from 'expo-router';

/** Now a page of You. Kept so the water screen's old links and saved links still land. */
export default function RemindersRedirect() {
  return <Redirect href="/you/reminders" />;
}
