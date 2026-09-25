export function createConnectivityController({ onChange }) {
  function report() {
    onChange(navigator.onLine);
  }

  window.addEventListener("online", report);
  window.addEventListener("offline", report);
  report();

  return { isOnline: () => navigator.onLine };
}
