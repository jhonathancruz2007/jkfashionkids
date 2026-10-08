import { resend } from "@/lib/resend";

const EMAIL_FROM =
  process.env.RESEND_FROM_EMAIL?.trim() ||
  "JK Fashion Kids <contato@jkfashionkids.com.br>";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  "https://jkfashionkids.com.br";

function escaparHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || "Cliente";
}

export async function enviarEmailBoasVindas(
  emailCliente: string,
  nomeCliente: string
) {
  const email = emailCliente.trim().toLowerCase();
  const nome = primeiroNome(nomeCliente);
  const nomeSeguro = escaparHtml(nome);
  const linkConta = `${APP_URL.replace(/\/$/, "")}/login`;

  const htmlContent = `
    <div style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
        <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;">
          JK Fashion Kids
        </h1>

        <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#111827;">
          Olá, ${nomeSeguro}.
        </p>

        <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#374151;">
          Seu cadastro na JK Fashion Kids foi realizado com sucesso.
        </p>

        <p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:#374151;">
          Sua conta já está ativa e você pode acessá-la usando o e-mail e a senha cadastrados.
        </p>

        <p style="margin:0 0 24px;">
          <a href="${linkConta}"
             style="display:inline-block;padding:11px 18px;border:1px solid #d1d5db;border-radius:8px;background:#ffffff;color:#111827;text-decoration:none;font-size:14px;font-weight:600;">
            Acessar minha conta
          </a>
        </p>

        <div style="border-top:1px solid #e5e7eb;padding-top:18px;margin-top:8px;">
          <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#6b7280;">
            Este é um e-mail automático de confirmação de cadastro.
          </p>
          <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">
            Se você não realizou este cadastro, pode ignorar esta mensagem.
          </p>
        </div>
      </div>
    </div>
  `;

  const textContent = `JK Fashion Kids\n\nOlá, ${nome}.\n\nSeu cadastro na JK Fashion Kids foi realizado com sucesso.\n\nSua conta já está ativa e você pode acessá-la usando o e-mail e a senha cadastrados.\n\nAcessar minha conta: ${linkConta}\n\nEste é um e-mail automático de confirmação de cadastro.\nSe você não realizou este cadastro, pode ignorar esta mensagem.`;

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: [email],
    subject: "Confirmação de cadastro - JK Fashion Kids",
    html: htmlContent,
    text: textContent,
  });

  if (error) {
    throw new Error(error.message || "Erro retornado pelo Resend ao enviar o e-mail de cadastro.");
  }

  return data;
}
