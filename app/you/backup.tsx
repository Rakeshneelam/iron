import { Screen } from '@/components';
import { DataTab } from '@/features/settings/tabs';

/** Backup, restore, export and deletion. A page of You. */
export default function BackupScreen() {
  return (
    <Screen title="Backup & data" back>
      <DataTab />
    </Screen>
  );
}
