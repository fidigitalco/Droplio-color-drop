import * as ExpoHaptics from 'expo-haptics';

let enabled = true;

export const Haptics = {
  setEnabled(on: boolean) {
    enabled = on;
  },
  light() {
    if (enabled) ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  medium() {
    if (enabled) ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  success() {
    if (enabled) ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success).catch(() => {});
  },
  warning() {
    if (enabled) ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  selection() {
    if (enabled) ExpoHaptics.selectionAsync().catch(() => {});
  },
};
