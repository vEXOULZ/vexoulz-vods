// Load now, then again every `ms` while the tab is visible. Keeps the last good data when a refresh fails.
import { onBeforeUnmount, onMounted, ref, shallowRef, type Ref } from 'vue'

export function usePoll<T>(load: (signal: AbortSignal) => Promise<T>, ms: number) {
  const data = shallowRef<T | null>(null) as Ref<T | null>
  const error = ref<string | null>(null)
  const loading = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let ctrl: AbortController | null = null
  let stopped = false

  async function refresh() {
    clearTimeout(timer)
    ctrl?.abort()
    const mine = (ctrl = new AbortController())
    loading.value = true
    try {
      data.value = await load(mine.signal)
      error.value = null
    } catch (e) {
      if (mine.signal.aborted) return
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (ctrl === mine) {
        loading.value = false
        schedule()
      }
    }
  }

  function schedule() {
    clearTimeout(timer)
    if (!stopped && ms > 0) timer = setTimeout(() => (document.hidden ? schedule() : refresh()), ms)
  }

  const onVisible = () => {
    if (!document.hidden) refresh()
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisible)
    refresh()
  })
  onBeforeUnmount(() => {
    stopped = true
    clearTimeout(timer)
    ctrl?.abort()
    document.removeEventListener('visibilitychange', onVisible)
  })

  return { data, error, loading, refresh }
}
