/** Parser de extrato OFX — o formato que todo banco brasileiro exporta.
 *  OFX 1.x é SGML (tags sem fechamento); 2.x é XML. Este parser lê os dois:
 *  extrai os blocos <STMTTRN> por regex, que é imune à diferença. */

export type OfxTransaction = {
  fitid: string
  date: string          // ISO
  amount_cents: number  // COM sinal: negativo = saiu
  memo: string
}

export function decodeOfx(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  /* cabeçalho OFX 1.x declara o charset; bancos BR adoram windows-1252 */
  if (/CHARSET:1252|ENCODING:USASCII/i.test(utf8.slice(0, 400)) || utf8.includes('�')) {
    return new TextDecoder('windows-1252').decode(buffer)
  }
  return utf8
}

export function parseOFX(text: string): OfxTransaction[] {
  const out: OfxTransaction[] = []
  const blocos = text.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) ?? []
  for (const b of blocos) {
    const campo = (tag: string) => {
      const m = b.match(new RegExp(`<${tag}>([^<\r\n]*)`, 'i'))
      return m ? m[1].trim() : ''
    }
    const fitid = campo('FITID')
    const dt = campo('DTPOSTED')
    const amt = campo('TRNAMT')
    if (!fitid || !dt || !amt) continue
    const date = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`
    const valor = Number(amt.replace(',', '.'))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(valor) || valor === 0) continue
    out.push({
      fitid,
      date,
      amount_cents: Math.round(valor * 100),
      memo: campo('MEMO') || campo('NAME') || '',
    })
  }
  return out
}
