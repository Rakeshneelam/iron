/**
 * expo-haptics stand-in. The repositories reach lib/haptics now — settings pushes
 * the user's preference into it — and a vibration means nothing under node:test.
 */
export const ImpactFeedbackStyle = { Light: 'light', Medium: 'medium', Heavy: 'heavy' } as const;
export const NotificationFeedbackType = { Success: 'success', Warning: 'warning', Error: 'error' } as const;
export async function selectionAsync(): Promise<void> {}
export async function impactAsync(): Promise<void> {}
export async function notificationAsync(): Promise<void> {}
