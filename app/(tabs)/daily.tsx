import { Redirect } from 'expo-router';

/**
 * /daily is no longer a destination — its check-in, weight and sleep moved into
 * Body as the Weight and Recovery sections (UX-01).
 *
 * The route stays because reminders scheduled by earlier versions carry it in
 * their payload: a morning weigh-in notification written last week still says
 * /daily, and it has to land on the weight it was about. `_layout.tsx` declares
 * this screen with href: null so automatic tab discovery cannot put a sixth tab
 * back in the bar.
 */
export default function DailyRedirect() {
  return <Redirect href="/body?section=weight" />;
}
