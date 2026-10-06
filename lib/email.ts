import { Resend } from "resend"

function escaparHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export async function enviarEmailBoasVindas(
  emailCliente: string,
  nomeCliente: string
) {
  const apiKey = process.env.RESEND_API_KEY?.trim()

  if (!apiKey) {
    throw new Error("RESEND_API_KEY não configurada nas variáveis de ambiente.")
  }

  const resend = new Resend(apiKey)
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://jkfashionkids.com.br"
  const emailFrom =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "JK Fashion Kids <contato@jkfashionkids.com.br>"

  const primeiroNome =
    nomeCliente.trim().split(/\s+/)[0] || "Cliente"
  const nomeEscapado = escaparHtml(primeiroNome)

  const { data, error } = await resend.emails.send({
    from: emailFrom,
    to: [emailCliente],
    subject: "Bem-vindo(a) à JK Fashion Kids! ✨",
    html: `
      <!doctype html>
      <html lang="pt-BR">
        <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
          <div style="padding:28px 16px;">
            <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;">
              <div style="padding:26px 24px;background:#111827;text-align:center;">
                <div style="font-size:13px;letter-spacing:1.6px;text-transform:uppercase;color:#cbd5e1;font-weight:700;">
                  JK Fashion Kids
                </div>
                <h1 style="margin:8px 0 0;color:#ffffff;font-size:28px;line-height:1.2;">
                  Bem-vindo(a)! 🎉
                </h1>
              </div>

              <div style="padding:28px 24px;">
                <p style="margin:0 0 12px;font-size:18px;font-weight:700;">
                  Olá, ${nomeEscapado}!
                </p>

                <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">
                  Seu cadastro na JK Fashion Kids foi realizado com sucesso.
                  Agora você já pode acessar nosso catálogo, conferir novidades e fazer suas compras com mais praticidade.
                </p>

                <div style="text-align:center;margin:28px 0;">
                  <a href="${appUrl}/catalogo"
                     style="display:inline-block;padding:14px 28px;border-radius:999px;background:#e11d48;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">
                    Acessar o catálogo
                  </a>
                </div>

                <div style="padding:16px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;">
                  <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
                    Este é um e-mail automático de confirmação de cadastro.
                    Caso você não tenha realizado este cadastro, pode desconsiderar esta mensagem.
                  </p>
                </div>
              </div>

              <div style="padding:18px 24px;border-top:1px solid #e5e7eb;text-align:center;">
                <p style="margin:0;font-size:12px;color:#94a3b8;">
                  JK Fashion Kids · ${appUrl.replace(/^https?:\/\//, "")}
                </p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `,
  })

  if (error) {
    throw new Error(error.message || "O Resend retornou um erro ao enviar o e-mail.")
  }

  return data
}
