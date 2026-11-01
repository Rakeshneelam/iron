import { Screen } from '@/components';
import { AlertsTab } from '@/features/settings/tabs';

/** Every reminder on its own switch, with quiet hours. A page of You. */
export default function RemindersScreen() {
  return (
    <Screen title="Reminders" back>
      <AlertsTab />
    </Screen>
  );
}
