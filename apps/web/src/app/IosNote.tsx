import { needsIosHomeScreen } from './install';

/** On iPhone/iPad Safari, explains how to keep saved data from being cleared. */
export default function IosNote() {
  if (!needsIosHomeScreen()) return null;
  return (
    <p className="app-ios-note">
      <strong>On iPhone and iPad:</strong> Safari deletes a website’s saved data if you don’t open it for 7 days. To keep
      your reports, tap <strong>Share</strong> → <strong>Add to Home Screen</strong> and open VitalDelta from there.
    </p>
  );
}
