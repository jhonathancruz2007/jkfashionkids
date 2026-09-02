import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cepDestino = searchParams.get("cep")?.replace(/\D/g, "");
  const tamanhoStr = searchParams.get("tamanho")?.toUpperCase() || "";
  const pesoStr = searchParams.get("peso");

  if (!cepDestino || cepDestino.length !== 8) {
    return NextResponse.json({ error: "CEP inválido" }, { status: 400 });
  }

  // Mapeamento automático de tamanhos (infantil/juvenil até 16 e adultos) para peso em kg
  const mapaPesosPorTamanho: Record<string, number> = {
    "2": 0.20,   // 200g
    "4": 0.25,   // 250g
    "6": 0.30,   // 300g
    "8": 0.35,   // 350g
    "10": 0.40,  // 400g
    "12": 0.45,  // 450g
    "14": 0.50,  // 500g
    "16": 0.60,  // 600g (Tamanho 16 considerado)
    "PP": 0.30,
    "P": 0.35,
    "M": 0.40,
    "G": 0.50,
    "GG": 0.60,
    "XG": 0.70
  };

  // Define o peso com base no tamanho enviado ou no peso direto, padrão de 500g se nada for informado
  let peso = 0.5;
  if (pesoStr) {
    peso = parseFloat(pesoStr);
  } else if (tamanhoStr && mapaPesosPorTamanho[tamanhoStr]) {
    peso = mapaPesosPorTamanho[tamanhoStr];
  }

  // CEP da loja na Vila Rezende (Piracicaba/SP)
  const cepLoja = "13405259"; 

  try {
    // 1. Consulta o ViaCEP para obter o bairro, cidade e estado de destino
    const responseViacep = await fetch(`https://viacep.com.br/ws/${cepDestino}/json/`);
    const dataViacep = await responseViacep.json();

    if (dataViacep.erro) {
      return NextResponse.json({ error: "CEP não encontrado" }, { status: 404 });
    }

    const bairroDestino = dataViacep.bairro?.toLowerCase() || "";
    const ehPiracicaba = dataViacep.localidade?.toLowerCase() === "piracicaba";
    const uf = dataViacep.uf;

    let valorFreteCalculado = 0;
    let servicoNome = "PAC (Correios)";
    let prazoDias = 5;

    // 2. Regras Locais (Piracicaba)
    const ehNoBairroDaLoja = ehPiracicaba && bairroDestino.includes("vila rezende");

    if (ehNoBairroDaLoja) {
      valorFreteCalculado = 0.00;
      servicoNome = "Entrega Grátis na Vila Rezende";
      prazoDias = 1;
    } else if (ehPiracicaba) {
      valorFreteCalculado = 12.00; // Entrega local fixa em Piracicaba (sem embalagem)
      servicoNome = "Entrega Local (Piracicaba)";
      prazoDias = 2;
    } else {
      // 3. CÁLCULO DINÂMICO POR DISTÂNCIA + PESO DO TAMANHO + EMBALAGEM (Fora de Piracicaba)
      const prefixoOrigem = parseInt(cepLoja.slice(0, 3), 10);     // 134 (Piracicaba)
      const prefixoDestino = parseInt(cepDestino.slice(0, 3), 10); // Destino

      const diferencaPostal = Math.abs(prefixoOrigem - prefixoDestino);

      const tarifaBase = 16.00;               
      const custoPorDistancia = 0.10;         
      const custoPorKg = 8.00;                
      const custoEmbalagem = 10.00; // Taxa de embalagem aplicada fora de Piracicaba

      // Fórmula matemática considerando o peso correspondente ao tamanho selecionado (ex: tamanho 16)
      const valorCalculado = tarifaBase + (diferencaPostal * custoPorDistancia) + (peso * custoPorKg) + custoEmbalagem;

      prazoDias = Math.min(Math.max(Math.ceil(diferencaPostal / 35) + 3, 3), 15);

      valorFreteCalculado = Number(valorCalculado.toFixed(2));
      servicoNome = "PAC (Correios)";
    }

    return NextResponse.json({ 
      sucesso: true,
      valorFrete: valorFreteCalculado,
      servico: servicoNome,
      prazoDias: prazoDias,
      cidade: dataViacep.localidade, 
      estado: uf,
      bairro: dataViacep.bairro,
      opcoes: [
        {
          servico: servicoNome,
          valorFrete: valorFreteCalculado,
          prazoDias: prazoDias,
        }
      ]
    });

  } catch (error) {
    console.error("Erro ao calcular frete:", error);
    return NextResponse.json({ error: "Erro ao calcular frete" }, { status: 500 });
  }
}