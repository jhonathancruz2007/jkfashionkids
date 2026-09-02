import Link from "next/link"
import { Gift } from "lucide-react"

interface FaixaEtaria {
  id: string
  label: string
  href: string
  bgColor: string
  textColor: string
  borderColor: string
}

const faixasIdade: FaixaEtaria[] = [
  {
    id: "ate-1-ano",
    label: "até 1 ano",
    href: "/busca?idade=0-1",
    bgColor: "bg-[#B5E2FA]",
    textColor: "text-[#005F73]",
    borderColor: "border-[#90E0EF]",
  },
  {
    id: "1-a-2-anos",
    label: "1 a 2 anos",
    href: "/busca?idade=1-2",
    bgColor: "bg-[#A8E6CF]",
    textColor: "text-[#1B4332]",
    borderColor: "border-[#80ED99]",
  },
  {
    id: "3-a-5-anos",
    label: "3 a 5 anos",
    href: "/busca?idade=3-5",
    bgColor: "bg-[#DCEDC1]",
    textColor: "text-[#2D6A4F]",
    borderColor: "border-[#C7F9CC]",
  },
  {
    id: "6-a-8-anos",
    label: "6 a 8 anos",
    href: "/busca?idade=6-8",
    bgColor: "bg-[#FFD3B6]",
    textColor: "text-[#7F4F24]",
    borderColor: "border-[#FFB5A7]",
  },
  {
    id: "mais-9-anos",
    label: "+9 anos",
    href: "/busca?idade=9-plus",
    bgColor: "bg-[#FFAAA5]",
    textColor: "text-[#6B2D5C]",
    borderColor: "border-[#FF8B94]",
  },
]

export function PresentesPorIdade() {
  return (
    <section className="w-full max-w-7xl mx-auto px-4 py-6">
      {/* Cabeçalho do Bloco */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gift className="w-6 h-6 text-amber-500 animate-bounce" />
          <h2 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">
            Presente por idade
          </h2>
        </div>
        <Link
          href="/categorias"
          className="text-sm font-semibold text-gray-600 hover:text-black underline underline-offset-4 transition-colors"
        >
          ver todas
        </Link>
      </div>

      {/* Lista de Pílulas de Idade */}
      <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none sm:grid sm:grid-cols-3 md:grid-cols-5 sm:overflow-visible">
        {faixasIdade.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={`
              flex-shrink-0 flex items-center justify-center
              px-6 py-3.5 md:py-4 rounded-full font-bold text-base md:text-lg
              shadow-sm hover:shadow-md transform hover:-translate-y-0.5 transition-all duration-200
              border text-center whitespace-nowrap min-w-[140px] sm:min-w-0
              ${item.bgColor} ${item.textColor} ${item.borderColor}
            `}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </section>
  )
} 