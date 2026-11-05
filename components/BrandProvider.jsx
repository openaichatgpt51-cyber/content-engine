'use client'
import { createContext, useContext } from 'react'

// enabled=false (flag off) => activeBrandId is null and nothing is filtered.
// writeBrandId is always the brand new rows belong to (default brand when off).
const BrandContext = createContext({
  enabled: false, brands: [], activeBrandId: null, writeBrandId: null, maxBrands: 1,
})

export function BrandProvider({ value, children }) {
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
}

export function useBrand() {
  return useContext(BrandContext)
}
