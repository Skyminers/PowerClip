import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { SemanticSearchResult } from '../types'
import { SEMANTIC_SEARCH_DEBOUNCE_MS } from '../constants'

interface UseSemanticSearchResult {
  results: SemanticSearchResult[]
  loading: boolean
  error: string | null
}

export function useSemanticSearch(
  query: string,
  limit: number = 50
): UseSemanticSearchResult {
  const [results, setResults] = useState<SemanticSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const searchResults = await invoke<SemanticSearchResult[]>(
        'semantic_search',
        { query: searchQuery, limit }
      )
      setResults(searchResults)
    } catch (e) {
      const errorMessage = typeof e === 'string' ? e : String(e)
      setError(errorMessage)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    if (!query.trim()) {
      setResults([])
      setLoading(false)
      setError(null)
      return
    }

    // Debounce the search
    setLoading(true)
    timeoutRef.current = setTimeout(() => {
      performSearch(query)
    }, SEMANTIC_SEARCH_DEBOUNCE_MS)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [query, performSearch])

  return { results, loading, error }
}
