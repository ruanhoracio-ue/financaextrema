'use client'
import { useCallback, useEffect, useState } from 'react'

/** Mini data-fetching: roda `fn`, expõe { data, loading, error, reload }. */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let vivo = true
    setLoading(true)
    fn()
      .then((d) => vivo && (setData(d), setError(null)))
      .catch((e) => vivo && setError(e.message ?? String(e)))
      .finally(() => vivo && setLoading(false))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, loading, error, reload }
}
