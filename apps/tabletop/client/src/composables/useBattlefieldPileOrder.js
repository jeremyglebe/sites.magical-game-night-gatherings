import { computed, shallowRef, toValue, watch } from "vue";

function browserStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

/** Local view preferences: never queue game actions or wake a player. */
export function useBattlefieldPileOrder(scope, { storage = browserStorage() } = {}) {
  const key = computed(() => `game-night:pile-order:v1:${String(toValue(scope) || "local")}`);
  const orders = shallowRef({});
  watch(key, (value) => {
    try {
      const stored = JSON.parse(storage?.getItem(value) || "{}");
      orders.value = Object.fromEntries(Object.entries(stored || {})
        .filter(([, ids]) => Array.isArray(ids))
        .map(([id, ids]) => [id, [...new Set(ids.filter((item) => typeof item === "string"))]]));
    } catch { orders.value = {}; }
  }, { immediate: true, flush: "sync" });

  function setOrder(rootId, cardIds) {
    if (!rootId || !Array.isArray(cardIds)) return;
    orders.value = {
      ...orders.value,
      [rootId]: [...new Set(cardIds.filter((id) => typeof id === "string"))],
    };
    try { storage?.setItem(key.value, JSON.stringify(orders.value)); } catch {
      // Storage restrictions must not prevent rearranging the current view.
    }
  }
  return { orders, setOrder };
}
