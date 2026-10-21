import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  toValue,
  watch,
} from "vue";
import {
  createReplay,
  startingDecks,
  conversationEvents,
  validateRecording,
} from "../../../shared/replay.mjs";
import { getJSON, localTableURL } from "../components/review/review-format.js";

export function useRecording(id) {
  const game = shallowRef(null),
    recording = shallowRef(null),
    replay = shallowRef(null);
  const loading = ref(false),
    error = ref(""),
    position = ref(0),
    playing = ref(false),
    speed = ref(1500),
    liveTableUrl = ref("/");
  let request = null,
    timer = null;
  const length = computed(() => replay.value?.length || 0);
  const state = computed(() => replay.value?.stateAt(position.value) || null);
  const decks = computed(() =>
    recording.value ? startingDecks(recording.value) : [],
  );
  const events = computed(() =>
    recording.value ? conversationEvents(recording.value) : [],
  );
  function stop() {
    clearInterval(timer);
    timer = null;
    playing.value = false;
  }
  function seek(value) {
    stop();
    position.value = Math.max(
      0,
      Math.min(length.value, Math.trunc(Number(value) || 0)),
    );
  }
  function play() {
    if (!length.value) return;
    if (position.value >= length.value) position.value = 0;
    playing.value = true;
    timer = setInterval(() => {
      position.value++;
      if (position.value >= length.value) stop();
    }, speed.value);
  }
  function toggle() {
    if (playing.value) stop();
    else play();
  }
  async function load(preserve = false) {
    stop();
    request?.abort();
    const controller = new AbortController();
    request = controller;
    const previous = position.value;
    if (!preserve) {
      game.value = null;
      recording.value = null;
      replay.value = null;
      position.value = 0;
    }
    loading.value = true;
    error.value = "";
    try {
      const data = await getJSON(
        `/api/games/${encodeURIComponent(toValue(id))}`,
        controller.signal,
      );
      const source = validateRecording(data.recording);
      const next = createReplay(source);
      if (controller.signal.aborted) return;
      recording.value = source;
      replay.value = next;
      game.value = data.game;
      liveTableUrl.value = localTableURL(data.liveTableUrl);
      position.value = preserve ? Math.min(previous, next.length) : next.length;
    } catch (e) {
      if (!controller.signal.aborted) error.value = e.message;
    } finally {
      if (request === controller) loading.value = false;
    }
  }
  watch(
    () => toValue(id),
    () => load(),
    { immediate: true },
  );
  watch(speed, () => {
    if (playing.value) {
      stop();
      play();
    }
  });
  const onVisibility = () => {
    if (document.hidden) stop();
  };
  onMounted(() => document.addEventListener("visibilitychange", onVisibility));
  onBeforeUnmount(() => {
    request?.abort();
    stop();
    document.removeEventListener("visibilitychange", onVisibility);
  });
  return {
    game,
    recording,
    loading,
    error,
    position,
    playing,
    speed,
    liveTableUrl,
    length,
    state,
    decks,
    events,
    load,
    seek,
    stop,
    toggle,
  };
}
