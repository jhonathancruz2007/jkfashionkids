import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function enviarEmailBoasVindas(emailCliente: string, nomeCliente: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://etrash.site"

  const htmlContent = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #090c15; color: #ffffff; padding: 32px; border-radius: 20px; max-width: 580px; margin: 0 auto; border: 1px solid #1e2638;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #ff2575; font-size: 26px; font-weight: 900; margin: 0; letter-spacing: -0.5px;">
          JKfashion <span style="color: #00d2ff;">Kids</span>
        </h1>
      </div>

      <h2 style="color: #ffffff; font-size: 20px; font-weight: 700; margin-bottom: 12px;">
        Seja muito bem-vindo(a), ${nomeCliente}! 🎉
      </h2>

      <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
        Seu cadastro foi realizado com sucesso. Agora você tem acesso exclusivo ao nosso catálogo de roupas infantis com as melhores condições e entregas rápidas!
      </p>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${appUrl}/catalogo" 
           style="background-color: #ff2575; color: #ffffff; padding: 14px 32px; text-decoration: none; font-weight: bold; font-size: 13px; border-radius: 9999px; display: inline-block; box-shadow: 0 4px 15px rgba(255, 37, 117, 0.4);">
          Conhecer o Catálogo
        </a>
      </div>

      <div style="border-top: 1px solid #1e2638; padding-top: 20px; margin-top: 28px; text-align: center; color: #64748b; font-size: 11px;">
        <p style="margin: 0;">Este é um e-mail automático de confirmação de cadastro.</p>
        <p style="margin: 4px 0 0 0;">Se você não realizou este cadastro, por favor ignore este e-mail.</p>
      </div>
    </div>
  `

  await transporter.sendMail({
    from: `"JKfashion Kids" <${process.env.SMTP_USER}>`,
    to: emailCliente,
    subject: "Boas-vindas à JKfashion Kids! ✨",
    html: htmlContent,
  })
}