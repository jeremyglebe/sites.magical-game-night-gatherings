import { ref, onMounted, onUnmounted } from "vue";
import { request } from "../lib/api.js";

// Only transport and lifecycle live here. The server owns the match; components
// receive its projections and the human composable owns the unsent local draft.
export function useLiveTable() {
  const app = ref(null),
    table = ref(null),
    connected = ref(false),
    loading = ref(true),
    error = ref(""),
    legacy = ref(false);
  let timer,
    flight,
    disposed = false;
  async function refresh() {
    if (flight) return flight;
    flight = (async () => {
      try {
        let nextApp = app.value;
        if (!legacy.value) {
          try {
            nextApp = await request("/api/app");
          } catch (e) {
            // The standalone MCP table authenticates unknown API routes, so
            // its missing /api/app responds with 401 rather than 404.
            if ([401, 404].includes(e.status)) legacy.value = true;
            else throw e;
          }
        }
        const nextTable =
          legacy.value || nextApp?.match ? await request("/api/table") : null;
        if (disposed) return;
        const matchChanged = nextApp?.match?.id !== app.value?.match?.id;
        app.value = nextApp;
        if (
          matchChanged ||
          nextTable?.revision !== table.value?.revision ||
          !nextTable
        )
          table.value = nextTable;
        connected.value = true;
        error.value = "";
      } catch (e) {
        if (!disposed) {
          connected.value = false;
          error.value = e.message;
        }
      } finally {
        loading.value = false;
      }
    })();
    try {
      await flight;
    } finally {
      flight = null;
    }
  }
  onMounted(() => {
    void refresh();
    timer = setInterval(refresh, 1200);
  });
  onUnmounted(() => {
    disposed = true;
    clearInterval(timer);
  });
  return { app, table, connected, loading, error, legacy, refresh, request };
}
