"use client"

import { useEffect, useState } from "react"
import { ArrowUp } from "lucide-react"

export default function VoltarAoTopo() {
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    const aoRolar = () => setVisivel(window.scrollY > 300)
    aoRolar()
    window.addEventListener("scroll", aoRolar, { passive: true })
    return () => window.removeEventListener("scroll", aoRolar)
  }, [])

  const subir = () => window.scrollTo({ top: 0, behavior: "smooth" })

  return (
    <button
      type="button"
      onClick={subir}
      aria-label="Voltar ao topo"
      className={`group fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-r from-[#f48fb1] to-[#b39ddb] text-white shadow-lg shadow-[#f48fb1]/30 transition-all duration-300 hover:scale-110 hover:shadow-xl hover:shadow-[#b39ddb]/40 active:scale-95 ${
        visivel ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
      }`}
    >
      <ArrowUp className="h-5 w-5 transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-110" />
    </button>
  )
}