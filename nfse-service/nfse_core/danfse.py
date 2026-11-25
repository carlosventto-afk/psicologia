"""DANFSe local: desenha o PDF a partir do XML autorizado da NFS-e.

Desde 03/08/2026 (Nota Tecnica 008/2026) o governo nao entrega mais o PDF pela API
do ADN; o emissor gera a representacao grafica a partir do XML. Layout: A4 retrato,
pagina unica, QR Code de consulta publica e campos padronizados. Tolerante: campo
ausente no XML vira "-" (nunca levanta por causa de tag opcional).
"""
from __future__ import annotations

import io
from datetime import datetime

from lxml import etree
from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

CONSULTA_PUBLICA = {
    "producao": "https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave={chave}",
    "homologacao": "https://www.producaorestrita.nfse.gov.br/ConsultaPublica/?tpc=1&chave={chave}",
}

OP_SIMPLES = {"1": "Não optante", "2": "Optante - MEI", "3": "Optante - ME/EPP"}
TRIB_ISSQN = {
    "1": "Operação tributável",
    "2": "Imunidade",
    "3": "Exportação de serviço",
    "4": "Não incidência",
}
RET_ISSQN = {"1": "Não retido", "2": "Retido pelo tomador", "3": "Retido pelo intermediario"}

VAZIO = "-"


def _no(raiz, caminho: str):
    """Primeiro elemento do caminho 'a/b/c' ignorando namespace (busca em toda a arvore)."""
    atual = [raiz]
    for parte in caminho.split("/"):
        proximo = []
        for no in atual:
            proximo.extend(no.xpath(f".//*[local-name()='{parte}']") if parte == caminho.split("/")[0] else no.xpath(f"./*[local-name()='{parte}']"))
        if not proximo:
            return None
        atual = proximo
    return atual[0]


def _txt(raiz, caminho: str) -> str:
    no = _no(raiz, caminho)
    return (no.text or "").strip() if no is not None else ""


def _primeiro(raiz, *caminhos: str) -> str:
    for c in caminhos:
        v = _txt(raiz, c)
        if v:
            return v
    return ""


def _doc(valor: str) -> str:
    d = "".join(ch for ch in valor if ch.isdigit())
    if len(d) == 14:
        return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"
    if len(d) == 11:
        return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}"
    return valor


def _moeda(valor: str) -> str:
    try:
        n = float(valor)
    except ValueError:
        return VAZIO
    return "R$ " + f"{n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _data(valor: str, com_hora: bool = False) -> str:
    if not valor:
        return VAZIO
    try:
        d = datetime.fromisoformat(valor)
    except ValueError:
        return valor
    return d.strftime("%d/%m/%Y %H:%M:%S") if com_hora else d.strftime("%d/%m/%Y")


def _endereco(no_end) -> str:
    if no_end is None:
        return ""
    partes = [
        _txt(no_end, "xLgr"), _txt(no_end, "nro"), _txt(no_end, "xCpl"), _txt(no_end, "xBairro"),
    ]
    cep = _primeiro(no_end, "CEP")
    linha = ", ".join(p for p in partes if p)
    if cep:
        linha += f" - CEP {cep[:5]}-{cep[5:]}" if len(cep) == 8 else f" - CEP {cep}"
    return linha


def extrair_campos(xml_nfse: bytes | str) -> dict:
    if isinstance(xml_nfse, str):
        xml_nfse = xml_nfse.encode("utf-8")
    raiz = etree.fromstring(xml_nfse)
    inf = _no(raiz, "infNFSe")
    if inf is None:
        raise ValueError("XML sem infNFSe")
    chave = (inf.get("Id") or "").removeprefix("NFS")
    emit = _no(inf, "emit")
    toma = _no(inf, "toma")
    serv = _no(inf, "serv")
    trib = _no(inf, "tribMun")
    ender_emit = emit.xpath("./*[local-name()='enderNac']") if emit is not None else []
    end_toma = toma.xpath("./*[local-name()='end']") if toma is not None else []
    end_toma_txt = ""
    if end_toma:
        e = end_toma[0]
        nac = e.xpath("./*[local-name()='endNac']")
        base = _endereco(e)
        cep = _primeiro(nac[0], "CEP") if nac else ""
        end_toma_txt = base + (f" - CEP {cep}" if cep else "")
    regime = _txt(inf, "opSimpNac")
    return {
        "chave": chave,
        "numero": _txt(inf, "nNFSe"),
        "serie": _txt(inf, "serie"),
        "ndps": _txt(inf, "nDPS"),
        "competencia": _data(_txt(inf, "dCompet")),
        "emissao_nfse": _data(_txt(inf, "dhProc"), True),
        "emissao_dps": _data(_txt(inf, "dhEmi"), True),
        "emit_doc": _doc(_primeiro(emit, "CNPJ", "CPF")) if emit is not None else "",
        "emit_nome": _txt(emit, "xNome") if emit is not None else "",
        "emit_end": _endereco(ender_emit[0]) if ender_emit else "",
        "emit_mun": f"{_txt(inf, 'xLocEmi')} - {_txt(emit, 'UF')}".strip(" -") if emit is not None else "",
        "emit_regime": OP_SIMPLES.get(regime, VAZIO),
        "toma_doc": _doc(_primeiro(toma, "CNPJ", "CPF", "NIF")) if toma is not None else "",
        "toma_nome": _txt(toma, "xNome") if toma is not None else "",
        "toma_end": end_toma_txt,
        "toma_email": _txt(toma, "email") if toma is not None else "",
        "toma_fone": _txt(toma, "fone") if toma is not None else "",
        "serv_cod": _txt(serv, "cTribNac") if serv is not None else "",
        "serv_trib_nac": _txt(inf, "xTribNac"),
        "serv_desc": _txt(serv, "xDescServ") if serv is not None else "",
        "serv_local": _txt(inf, "xLocPrestacao"),
        "valor_servico": _moeda(_txt(inf, "vServ")),
        "valor_liquido": _moeda(_txt(inf, "vLiq")),
        "trib_issqn": TRIB_ISSQN.get(_txt(trib, "tribISSQN"), VAZIO) if trib is not None else VAZIO,
        "ret_issqn": RET_ISSQN.get(_txt(trib, "tpRetISSQN"), VAZIO) if trib is not None else VAZIO,
        "info_compl": _txt(serv, "infoCompl") if serv is not None else "",
    }


def _quebrar(c: canvas.Canvas, texto: str, fonte: str, tamanho: float, largura: float) -> list[str]:
    linhas: list[str] = []
    for paragrafo in (texto or VAZIO).split("\n"):
        atual = ""
        for palavra in paragrafo.split():
            teste = f"{atual} {palavra}".strip()
            if c.stringWidth(teste, fonte, tamanho) <= largura:
                atual = teste
            else:
                if atual:
                    linhas.append(atual)
                atual = palavra
        linhas.append(atual)
    return linhas


def gerar_danfse(xml_nfse: bytes | str, ambiente: str = "producao") -> bytes:
    """PDF (A4, 1 pagina) do DANFSe. Levanta ValueError se o XML nao for uma NFS-e."""
    d = extrair_campos(xml_nfse)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"DANFSe {d['numero']}")
    larg, alt = A4
    mx = 12 * mm
    inner = larg - 2 * mx
    y = alt - 12 * mm

    def titulo(txt: str):
        nonlocal y
        c.setFillGray(0.9)
        c.rect(mx, y - 5.5 * mm, inner, 5.5 * mm, stroke=0, fill=1)
        c.setFillGray(0)
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(mx + 2 * mm, y - 4 * mm, txt.upper())
        y -= 8 * mm

    def campo(x: float, rotulo: str, valor: str, largura: float):
        c.setFont("Helvetica", 6.5)
        c.setFillGray(0.35)
        c.drawString(x, y, rotulo)
        c.setFillGray(0)
        c.setFont("Helvetica-Bold", 8.5)
        txt = valor or VAZIO
        while c.stringWidth(txt, "Helvetica-Bold", 8.5) > largura and len(txt) > 4:
            txt = txt[:-2]
        c.drawString(x, y - 3.8 * mm, txt)

    def linha_campos(*itens: tuple[str, str, float]):
        """itens: (rotulo, valor, fracao da largura)."""
        nonlocal y
        x = mx + 2 * mm
        for rotulo, valor, fracao in itens:
            w = inner * fracao
            campo(x, rotulo, valor, w - 3 * mm)
            x += w
        y -= 9 * mm

    # Cabecalho
    c.setFont("Helvetica-Bold", 15)
    c.drawString(mx, y - 5 * mm, "DANFSe")
    c.setFont("Helvetica", 8)
    c.drawString(mx, y - 9.5 * mm, "Documento Auxiliar da NFS-e - Nota Fiscal de Serviço Eletrônica")
    if ambiente != "producao":
        c.setFillColorRGB(0.8, 0, 0)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(mx, y - 14 * mm, "SEM VALIDADE FISCAL - AMBIENTE DE HOMOLOGAÇÃO")
        c.setFillGray(0)

    qr = QrCodeWidget(CONSULTA_PUBLICA.get(ambiente, CONSULTA_PUBLICA["producao"]).format(chave=d["chave"]))
    x0, y0, x1, y1 = qr.getBounds()
    lado = 26 * mm
    desenho = Drawing(lado, lado, transform=[lado / (x1 - x0), 0, 0, lado / (y1 - y0), 0, 0])
    desenho.add(qr)
    renderPDF.draw(desenho, c, larg - mx - lado, y - lado + 2 * mm)
    c.setFont("Helvetica", 6)
    c.drawRightString(larg - mx, y - lado - 0.5 * mm, "Consulta pública pelo QR Code")
    y -= 17 * mm

    c.setFont("Helvetica", 6.5)
    c.setFillGray(0.35)
    c.drawString(mx, y, "CHAVE DE ACESSO")
    c.setFillGray(0)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(mx, y - 3.8 * mm, d["chave"] or VAZIO)
    y -= 12 * mm
    linha_campos(
        ("NÚMERO DA NFS-E", d["numero"], 0.2),
        ("COMPETÊNCIA", d["competencia"], 0.2),
        ("EMISSÃO DA NFS-E", d["emissao_nfse"], 0.32),
        ("SÉRIE / DPS", f"{d['serie'] or VAZIO} / {d['ndps'] or VAZIO}", 0.28),
    )
    y -= 1 * mm

    titulo("Prestador do serviço")
    linha_campos(("CNPJ / CPF", d["emit_doc"], 0.28), ("NOME / RAZÃO SOCIAL", d["emit_nome"], 0.72))
    linha_campos(("ENDEREÇO", d["emit_end"], 0.72), ("MUNICÍPIO", d["emit_mun"], 0.28))
    linha_campos(("REGIME TRIBUTÁRIO (SIMPLES NACIONAL)", d["emit_regime"], 1.0))

    titulo("Tomador do serviço")
    linha_campos(("CNPJ / CPF", d["toma_doc"], 0.28), ("NOME / RAZÃO SOCIAL", d["toma_nome"], 0.72))
    if d["toma_end"] or d["toma_email"] or d["toma_fone"]:
        linha_campos(("ENDEREÇO", d["toma_end"], 0.5), ("E-MAIL", d["toma_email"], 0.3), ("TELEFONE", d["toma_fone"], 0.2))

    titulo("Serviço prestado")
    linha_campos(
        ("CÓDIGO DE TRIBUTAÇÃO NACIONAL", d["serv_cod"], 0.28),
        ("DESCRIÇÃO DO CÓDIGO", d["serv_trib_nac"], 0.44),
        ("LOCAL DA PRESTAÇÃO", d["serv_local"], 0.28),
    )
    c.setFont("Helvetica", 6.5)
    c.setFillGray(0.35)
    c.drawString(mx + 2 * mm, y, "DISCRIMINAÇÃO DO SERVIÇO")
    c.setFillGray(0)
    y -= 4 * mm
    c.setFont("Helvetica", 8.5)
    for ln in _quebrar(c, d["serv_desc"], "Helvetica", 8.5, inner - 4 * mm)[:14]:
        c.drawString(mx + 2 * mm, y, ln)
        y -= 4 * mm
    y -= 3 * mm

    titulo("Tributação municipal e valores")
    linha_campos(("TRIBUTAÇÃO DO ISSQN", d["trib_issqn"], 0.4), ("RETENÇÃO DO ISSQN", d["ret_issqn"], 0.3), ("VALOR DO SERVIÇO", d["valor_servico"], 0.3))
    linha_campos(("VALOR LÍQUIDO DA NFS-E", d["valor_liquido"], 1.0))

    if d["info_compl"]:
        titulo("Informações complementares")
        c.setFont("Helvetica", 8.5)
        for ln in _quebrar(c, d["info_compl"], "Helvetica", 8.5, inner - 4 * mm)[:8]:
            c.drawString(mx + 2 * mm, y, ln)
            y -= 4 * mm

    c.setFont("Helvetica", 6.5)
    c.setFillGray(0.4)
    c.drawString(mx, 10 * mm, "Representação gráfica gerada a partir do XML autorizado da NFS-e. O XML é o documento fiscal; valide pelo QR Code.")
    c.showPage()
    c.save()
    return buf.getvalue()
