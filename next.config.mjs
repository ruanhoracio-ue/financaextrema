/** @type {import('next').NextConfig} */
export default {
  /* Export estático: o app inteiro roda no navegador contra o Supabase do
     aluno, então o deploy na Cloudflare é só servir arquivos — sem runtime. */
  output: 'export',
}
