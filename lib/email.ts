import { resend } from "@/lib/resend"

const EMAIL_FROM =
  process.env.RESEND_FROM_EMAIL?.trim() ||
  "JK Fashion Kids <contato@jkfashionkids.com.br>"

function escaparHtml(valor: string) {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export async function enviarEmailBoasVindas(emailCliente: string, nomeCliente: string) {
  // URL absoluta e fixa para evitar que variáveis de ambiente mal configuradas
  // gerem um link inválido dentro de clientes de e-mail.
  const catalogoUrl = "https://jkfashionkids.com.br/catalogo"
  const nomeSeguro = escaparHtml(nomeCliente || "Cliente")

  const htmlContent = `
    <div style="margin:0; padding:32px 16px; background:#f7f8fc; font-family:Arial,Helvetica,sans-serif; color:#253047;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px; margin:0 auto; border-collapse:separate;">
        <tr>
          <td style="background:linear-gradient(135deg,#ff5c9a 0%,#ff79b1 45%,#6ed8ff 100%); border-radius:26px 26px 0 0; padding:30px 24px; text-align:center;">
            <div style="font-size:30px; line-height:1; margin-bottom:12px;">🌈 ✨ 🧸</div>
            <div style="font-size:28px; font-weight:900; letter-spacing:-0.8px; color:#ffffff;">
              JKfashion <span style="color:#17345f;">Kids</span>
            </div>
            <div style="margin-top:8px; color:#ffffff; font-size:13px; font-weight:700; opacity:.96;">
              Um cantinho cheio de diversão para os pequenos 💙
            </div>
          </td>
        </tr>

        <tr>
          <td style="background:#ffffff; padding:34px 30px 30px; border-left:1px solid #eceff5; border-right:1px solid #eceff5;">
            <div style="text-align:center; font-size:26px; margin-bottom:8px;">🎉</div>
            <h1 style="margin:0 0 14px; text-align:center; color:#253047; font-size:24px; line-height:1.25; font-weight:900;">
              Cadastro confirmado, ${nomeSeguro}!
            </h1>
            <p style="margin:0 auto 14px; max-width:500px; text-align:center; color:#5f6b80; font-size:15px; line-height:1.7;">
              Que alegria ter você com a gente! Seu cadastro na JK Fashion Kids foi realizado com sucesso. 💛
            </p>
            <p style="margin:0 auto; max-width:500px; text-align:center; color:#5f6b80; font-size:15px; line-height:1.7;">
              Agora é só dar uma olhadinha no nosso catálogo e descobrir as peças preparadas para deixar os pequenos ainda mais estilosos. 🥰
            </p>

            <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center" style="margin:30px auto 18px; border-collapse:separate;">
              <tr>
                <td align="center" bgcolor="#ff4f96" style="background:#ff4f96; border-radius:999px;">
                  <a href="${catalogoUrl}" target="_blank" rel="noopener noreferrer"
                     role="button" aria-label="Acessar catálogo da JK Fashion Kids"
                     style="display:inline-block; min-width:190px; box-sizing:border-box; padding:15px 30px; border-radius:999px; background:#ff4f96; color:#ffffff !important; text-decoration:none !important; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:20px; font-weight:900; text-align:center;">
                    Acessar catálogo
                  </a>
                </td>
              </tr>
            </table>

            <div style="text-align:center; margin-top:22px; font-size:22px;">🦄 ⭐ 🧸 🎈</div>
          </td>
        </tr>

        <tr>
          <td style="background:#fff; border:1px solid #eceff5; border-top:0; border-radius:0 0 26px 26px; padding:20px 24px 24px; text-align:center;">
            <p style="margin:0 0 5px; color:#8b95a7; font-size:11px; line-height:1.6;">
              Este é um e-mail automático de confirmação de cadastro.
            </p>
            <p style="margin:0; color:#a0a8b7; font-size:11px; line-height:1.6;">
              Se você não realizou este cadastro, basta ignorar esta mensagem.
            </p>
          </td>
        </tr>
      </table>
    </div>
  `

  const textContent = [
    `Cadastro confirmado, ${nomeCliente || "Cliente"}!`,
    "",
    "Que alegria ter você com a gente! Seu cadastro na JK Fashion Kids foi realizado com sucesso.",
    "Agora você já pode conhecer nosso catálogo.",
    "",
    `Acessar catálogo: ${catalogoUrl}`,
    "",
    "Este é um e-mail automático de confirmação de cadastro.",
  ].join("\n")

  if (!process.env.RESEND_API_KEY?.trim()) {
    throw new Error("RESEND_API_KEY não configurada nas variáveis de ambiente.")
  }

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: [emailCliente.trim().toLowerCase()],
    subject: "Cadastro confirmado na JK Fashion Kids 🎉",
    text: textContent,
    html: htmlContent,
  })

  if (error) {
    throw new Error(`Resend: ${error.message || "Erro ao enviar o e-mail."}`)
  }

  console.info("=== RESEND: E-MAIL DE BOAS-VINDAS ENVIADO ===", {
    email: emailCliente.trim().toLowerCase(),
    id: data?.id || null,
  })

  return data

}
