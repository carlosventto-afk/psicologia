"""DANFSe local (layout "DANFSe v2.0"): desenha o PDF a partir do XML autorizado.

Desde 03/08/2026 (Nota Tecnica 008/2026) o governo nao entrega mais o PDF pela API do
ADN; o emissor gera a representacao grafica a partir do XML. Layout seguindo o modelo
oficial: A4 retrato, pagina unica, QR Code, blocos padronizados (incluindo IBS/CBS) e
rodape de cientificacao. Tolerante: campo ausente no XML vira "-".
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

V = "-"
OP_SIMPLES = {
    "1": "Não Optante",
    "2": "Optante - Microempreendedor Individual (MEI)",
    "3": "Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)",
}
REG_AP_SN = {
    "1": "Regime de apuração dos tributos federais e municipal pelo Simples Nacional",
    "2": "Regime de apuração dos tributos federais pelo SN e ISSQN pela NFS-e conforme respectivas legislações municipais",
    "3": "Regime de apuração dos tributos federais e municipal pela NFS-e conforme respectivas legislações federal e municipal",
}
TRIB_ISSQN = {"1": "Operação Tributável", "2": "Imunidade", "3": "Exportação de Serviço", "4": "Não Incidência"}
RET_ISSQN = {"1": "Não Retido", "2": "Retido pelo Tomador", "3": "Retido pelo Intermediário"}
SITUACAO = {"100": "NFS-e Gerada"}


def _no(raiz, caminho: str):
    """Elemento de 'a/b/c' ignorando namespace: 'a' em qualquer profundidade, resto como filhos."""
    partes = caminho.split("/")
    atual = raiz.xpath(f".//*[local-name()='{partes[0]}']")
    for parte in partes[1:]:
        atual = [f for n in atual for f in n.xpath(f"./*[local-name()='{parte}']")]
    return atual[0] if atual else None


def _t(raiz, caminho: str) -> str:
    if raiz is None:
        return ""
    no = _no(raiz, caminho)
    return (no.text or "").strip() if no is not None else ""


def _doc(valor: str) -> str:
    d = "".join(ch for ch in valor if ch.isdigit())
    if len(d) == 14:
        return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"
    if len(d) == 11:
        return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}"
    return valor or V


def _moeda(valor: str) -> str:
    try:
        n = float(valor)
    except (TypeError, ValueError):
        return V
    return "R$ " + f"{n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _pct(valor: str) -> str:
    try:
        return f"{float(valor):.2f}".replace(".", ",") + " %"
    except (TypeError, ValueError):
        return V


def _data(valor: str, com_hora: bool = False) -> str:
    if not valor:
        return V
    try:
        d = datetime.fromisoformat(valor)
    except ValueError:
        return valor
    return d.strftime("%d/%m/%Y %H:%M:%S") if com_hora else d.strftime("%d/%m/%Y")


def _cep(v: str) -> str:
    return f"{v[:2]}.{v[2:5]}-{v[5:]}" if len(v) == 8 and v.isdigit() else (v or V)


def _ibge(v: str) -> str:
    return f"{v[:2]}.{v[2:]}" if len(v) == 7 and v.isdigit() else (v or V)


def _cod_trib(v: str) -> str:
    return f"{v[:2]}.{v[2:4]}.{v[4:]}" if len(v) == 6 and v.isdigit() else (v or V)


def _endereco(end) -> str:
    if end is None:
        return V
    partes = [_t(end, "xLgr"), _t(end, "nro"), _t(end, "xCpl"), _t(end, "xBairro")]
    return ", ".join(p for p in partes if p) or V


def _parte(inf, tag: str) -> dict:
    """Prestador (emit) ou tomador (toma): campos comuns do bloco de pessoa."""
    no = _no(inf, tag)
    end = None
    cod_mun = cep = ""
    if no is not None:
        end = _no(no, "enderNac") if tag == "emit" else _no(no, "end")
        if end is not None:
            nac = _no(end, "endNac")
            cod_mun = _t(end, "cMun") or _t(nac, "cMun")
            cep = _t(end, "CEP") or _t(nac, "CEP")
    return {
        "doc": _doc(_t(no, "CNPJ") or _t(no, "CPF") or _t(no, "NIF")),
        "im": _t(no, "IM") or V,
        "fone": _t(no, "fone") or V,
        "nome": _t(no, "xNome") or V,
        "email": _t(no, "email") or V,
        "uf": _t(end, "UF") if end is not None else "",
        "end": _endereco(end),
        "ibge_cep": f"{_ibge(cod_mun)} / {_cep(cep)}" if (cod_mun or cep) else V,
    }


def extrair_campos(xml_nfse: bytes | str) -> dict:
    if isinstance(xml_nfse, str):
        xml_nfse = xml_nfse.encode("utf-8")
    raiz = etree.fromstring(xml_nfse)
    inf = _no(raiz, "infNFSe")
    if inf is None:
        raise ValueError("XML sem infNFSe")
    prest_dps = _no(inf, "prest")
    toma = _parte(inf, "toma")
    emit = _parte(inf, "emit")
    mun_emit = _t(inf, "xLocEmi")
    emit["mun_uf"] = f"{mun_emit} / {emit['uf']}" if mun_emit and emit["uf"] else V
    toma["mun_uf"] = V
    # O prestador na DPS pode trazer IM, telefone e e-mail que o emit da NFS-e nao tem.
    for chave in ("im", "fone", "email"):
        valor = _t(prest_dps, {"im": "IM", "fone": "fone", "email": "email"}[chave])
        if valor:
            emit[chave] = valor

    trib_mun = _no(inf, "tribMun")
    tot = _no(inf, "pTotTrib")
    v_liq = _t(inf, "vLiq")
    compl = _t(inf, "infCpl") or _t(inf, "xInfComp")
    totais = ""
    if tot is not None:
        totais = (
            "Totais aproximados dos Tributos cfe. Lei n° 12.741/2012: "
            f"Federais: {_pct(_t(tot, 'pTotTribFed'))}; Estaduais: {_pct(_t(tot, 'pTotTribEst'))}; "
            f"Municipais: {_pct(_t(tot, 'pTotTribMun'))};"
        )
    loc_incid = _t(inf, "xLocIncid")
    aliq = _t(inf, "pAliqAplic")
    return {
        "chave": (inf.get("Id") or "").removeprefix("NFS"),
        "numero": _t(inf, "nNFSe") or V,
        "serie": _t(inf, "serie") or V,
        "ndps": _t(inf, "nDPS") or V,
        "competencia": _data(_t(inf, "dCompet")),
        "emissao_nfse": _data(_t(inf, "dhProc"), True),
        "emissao_dps": _data(_t(inf, "dhEmi"), True),
        "amb_ger": _t(inf, "ambGer") or V,
        "tp_amb": _t(inf, "tpAmb") or V,
        "municipio": f"{mun_emit} - {emit['uf']}" if mun_emit and emit["uf"] else mun_emit,
        "situacao": SITUACAO.get(_t(inf, "cStat"), V),
        "emit": emit,
        "toma": toma,
        "regime_sn": OP_SIMPLES.get(_t(inf, "opSimpNac"), V),
        "regime_ap": REG_AP_SN.get(_t(inf, "regApTribSN"), V),
        "serv_cod": f"{_cod_trib(_t(inf, 'cTribNac'))} / {_t(inf, 'cTribMun') or V}",
        "nbs": _t(inf, "NBS") or V,
        "serv_local": f"{_t(inf, 'xLocPrestacao') or V} / {emit['uf'] or V} / -",
        "serv_trib_nac": _t(inf, "xTribNac"),
        "serv_desc": _t(inf, "xDescServ"),
        "trib_issqn": TRIB_ISSQN.get(_t(trib_mun, "tribISSQN"), V),
        "incidencia": f"{loc_incid or V} / {emit['uf'] or V} / -",
        "ret_issqn": RET_ISSQN.get(_t(trib_mun, "tpRetISSQN"), V),
        "bc_issqn": _moeda(_t(inf, "vBC")),
        "aliq": _pct(aliq) if aliq else V,
        "issqn": _moeda(_t(inf, "vISSQN")),
        "valor_servico": _moeda(_t(inf, "vServ")),
        "valor_liquido": _moeda(v_liq),
        "info": "\n".join(x for x in (totais, compl) if x),
    }


def _quebrar(c: canvas.Canvas, texto: str, fonte: str, tamanho: float, largura: float) -> list[str]:
    linhas: list[str] = []
    for paragrafo in (texto or "").split("\n"):
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
    """PDF (A4, 1 pagina) do DANFSe v2.0. Levanta ValueError se o XML nao for uma NFS-e."""
    d = extrair_campos(xml_nfse)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"DANFSe {d['numero']}")
    larg, alt = A4
    mx = 7 * mm
    inner = larg - 2 * mx
    topo = alt - 7 * mm
    base = 7 * mm
    rodape_h = 11 * mm
    y = topo

    c.setLineWidth(0.5)
    c.rect(mx, base, inner, topo - base)

    def linha():
        c.setLineWidth(0.4)
        c.line(mx, y, mx + inner, y)

    def celula(x, w, h, rotulo, valor, cinza=False):
        if cinza:
            c.setFillGray(0.93)
            c.rect(x, y - h, w, h, stroke=0, fill=1)
            c.setFillGray(0)
        if rotulo:
            tam = 7.2 if cinza else 6.3
            while c.stringWidth(rotulo, "Helvetica-Bold", tam) > w - 2 * mm and tam > 4.5:
                tam -= 0.2
            c.setFont("Helvetica-Bold", tam)
            c.drawString(x + 1.5 * mm, y - 3 * mm, rotulo)
        if valor:
            txt = valor
            while c.stringWidth(txt, "Helvetica", 7.8) > w - 3 * mm and len(txt) > 4:
                txt = txt[:-2]
            if txt != valor:
                txt = txt.rstrip() + "..."
            c.setFont("Helvetica", 7.8)
            c.drawString(x + 1.5 * mm, y - 6.6 * mm, txt)

    def row(*cells, h=9 * mm, largura=inner, x0=mx):
        """cells: (fracao, rotulo, valor[, cinza])."""
        nonlocal y
        linha()
        x = x0
        for cell in cells:
            frac, rotulo, valor = cell[0], cell[1], cell[2]
            celula(x, largura * frac, h, rotulo, valor, cell[3] if len(cell) > 3 else False)
            x += largura * frac
        y -= h

    def aviso(texto):
        nonlocal y
        linha()
        c.setFont("Helvetica", 7)
        c.drawCentredString(mx + inner / 2, y - 3.6 * mm, texto)
        y -= 5 * mm

    # --- Cabecalho
    c.setFont("Helvetica-Bold", 20)
    c.setFillColorRGB(0.1, 0.55, 0.25)
    c.drawString(mx + 3 * mm, y - 10 * mm, "NFS")
    c.setFillColorRGB(0.1, 0.35, 0.65)
    c.drawString(mx + 3 * mm + c.stringWidth("NFS", "Helvetica-Bold", 20), y - 10 * mm, "e")
    c.setFillGray(0.3)
    c.setFont("Helvetica", 6.5)
    c.drawString(mx + 22 * mm, y - 8 * mm, "Nota Fiscal de")
    c.drawString(mx + 22 * mm, y - 11.2 * mm, "Serviço eletrônica")
    c.setFillGray(0)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawCentredString(mx + inner / 2, y - 7.2 * mm, "DANFSe v2.0")
    c.drawCentredString(mx + inner / 2, y - 11.4 * mm, "Documento Auxiliar da NFS-e")
    c.setFont("Helvetica", 8.5)
    c.drawRightString(mx + inner - 2 * mm, y - 6 * mm, f"Município: {d['municipio'] or V}")
    c.setFont("Helvetica", 6.5)
    c.drawRightString(mx + inner - 2 * mm, y - 9.4 * mm, f"Ambiente Gerador: {d['amb_ger']}")
    c.drawRightString(mx + inner - 2 * mm, y - 12.4 * mm, f"Tipo de Ambiente: {d['tp_amb']}")
    if ambiente != "producao":
        c.setFillColorRGB(0.8, 0, 0)
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(mx + inner / 2, y - 15.5 * mm, "SEM VALIDADE FISCAL - AMBIENTE DE HOMOLOGAÇÃO")
        c.setFillGray(0)
    y -= 17 * mm

    # --- Chave de acesso, campos principais e QR Code
    bloco_y = y
    lado = 22 * mm
    esq = inner - 40 * mm
    linha()
    c.setFont("Helvetica-Bold", 6.8)
    c.drawString(mx + 1.5 * mm, y - 3.2 * mm, "CHAVE DE ACESSO DA NFS-e")
    c.setFont("Helvetica", 8.5)
    c.drawString(mx + 1.5 * mm, y - 6.8 * mm, d["chave"] or V)
    y -= 8 * mm
    row((1 / 3, "NÚMERO DA NFS-e", d["numero"]), (1 / 3, "COMPETÊNCIA DA NFS-e", d["competencia"]),
        (1 / 3, "DATA E HORA DA EMISSÃO DA NFS-e", d["emissao_nfse"]), largura=esq)
    row((1 / 3, "NÚMERO DA DPS", d["ndps"]), (1 / 3, "SÉRIE DA DPS", d["serie"]),
        (1 / 3, "DATA E HORA DA EMISSÃO DA DPS", d["emissao_dps"]), largura=esq)
    y = bloco_y - 31 * mm
    qr = QrCodeWidget(CONSULTA_PUBLICA.get(ambiente, CONSULTA_PUBLICA["producao"]).format(chave=d["chave"]))
    x0, y0, x1, y1 = qr.getBounds()
    desenho = Drawing(lado, lado, transform=[lado / (x1 - x0), 0, 0, lado / (y1 - y0), 0, 0])
    desenho.add(qr)
    renderPDF.draw(desenho, c, mx + inner - 20 * mm - lado / 2, bloco_y - lado - 1 * mm)
    c.setFont("Helvetica", 5.4)
    for i, ln in enumerate(("A autenticidade desta NFS-e pode ser", "verificada pela leitura deste código QR", "ou pela consulta da chave de acesso no", "portal nacional da NFS-e")):
        c.drawCentredString(mx + inner - 20 * mm, bloco_y - lado - (4.6 + 2.3 * i) * mm, ln)

    emit, toma = d["emit"], d["toma"]
    row((0.34, "EMITENTE DA NFS-e", "Prestador", True), (0.33, "SITUAÇÃO DA NFS-e", d["situacao"]), (0.33, "FINALIDADE", V))
    row((0.34, "PRESTADOR / FORNECEDOR", "", True), (0.22, "CNPJ / CPF / NIF", emit["doc"]),
        (0.22, "Indicador Municipal (Inscrição)", emit["im"]), (0.22, "Telefone", emit["fone"]))
    row((0.5, "Nome / Nome Empresarial", emit["nome"]), (0.25, "Município / Sigla UF", emit["mun_uf"]),
        (0.25, "Código IBGE / CEP", emit["ibge_cep"]))
    row((0.5, "Endereço", emit["end"]), (0.5, "E-mail", emit["email"]))
    row((0.34, "Simples Nacional na Data de Competência", d["regime_sn"]), (0.66, "Regime de Apuração Tributária pelo SN", d["regime_ap"]))
    row((0.34, "TOMADOR / ADQUIRENTE", "", True), (0.22, "CNPJ / CPF / NIF", toma["doc"]),
        (0.22, "Indicador Municipal (Inscrição)", toma["im"]), (0.22, "Telefone", toma["fone"]))
    row((0.5, "Nome / Nome Empresarial", toma["nome"]), (0.25, "Município / Sigla UF", toma["mun_uf"]),
        (0.25, "Código IBGE / CEP", toma["ibge_cep"]))
    row((0.5, "Endereço", toma["end"]), (0.5, "E-mail", toma["email"]))
    aviso("DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e")
    aviso("INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e")

    row((0.28, "SERVIÇO PRESTADO", "", True), (0.24, "Código de Tributação Nacional/Municipal", d["serv_cod"]),
        (0.2, "Código da NBS", d["nbs"]), (0.28, "Local da Prestação / Sigla UF / País", d["serv_local"]))
    # Descricao do servico (altura variavel)
    titulo = _quebrar(c, d["serv_trib_nac"], "Helvetica", 7.8, inner - 3 * mm)
    desc = _quebrar(c, d["serv_desc"], "Helvetica", 7.8, inner - 3 * mm)[:12]
    h_desc = (3.5 + 3.4 * len(titulo) + 1.5 + 3.3 + 3.4 * len(desc) + 2) * mm
    linha()
    yy = y - 3.5 * mm
    c.setFont("Helvetica", 7.8)
    for ln in titulo:
        c.drawString(mx + 1.5 * mm, yy, ln)
        yy -= 3.4 * mm
    yy -= 1.5 * mm
    c.setFont("Helvetica-Bold", 6.3)
    c.drawString(mx + 1.5 * mm, yy, "Descrição do Serviço")
    yy -= 3.3 * mm
    c.setFont("Helvetica", 7.8)
    for ln in desc:
        c.drawString(mx + 1.5 * mm, yy, ln)
        yy -= 3.4 * mm
    y -= h_desc

    row((0.28, "TRIBUTAÇÃO MUNICIPAL (ISSQN)", "", True), (0.3, "Tipo de Tributação do ISSQN", d["trib_issqn"]),
        (0.42, "Município / Sigla UF / País de Incidência do ISSQN", d["incidencia"]))
    row((0.28, "BC ISSQN", d["bc_issqn"]), (0.24, "Alíquota Aplicada", d["aliq"]),
        (0.24, "Retenção do ISSQN", d["ret_issqn"]), (0.24, "ISSQN Apurado", d["issqn"]))
    row((0.28, "TRIBUTAÇÃO FEDERAL (EXCETO CBS)", "", True), (0.24, "IRRF", V),
        (0.24, "Contribuição Previdenciária - Retida", V), (0.24, "Contribuições Sociais - Retidas", V))
    row((0.28, "PIS - Débito Apuração Própria", V), (0.24, "COFINS - Débito Apuração Própria", V),
        (0.48, "Descrição Contrib. Sociais - Retidas", V))
    row((0.28, "TRIBUTAÇÃO IBS/CBS", "", True), (0.24, "CST / cClassTrib", "- / -"),
        (0.48, "Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF", "- / - / - / -"))
    row((0.28, "Exclusões e Reduções da Base de Cálculo", "R$ 0,00"), (0.24, "Base de Cálculo Após Exclusões e Reduções", V),
        (0.24, "Red. Alíquota IBS / Red. Alíquota CBS", "- / -"), (0.24, "Alíquota - IBS UF / IBS Mun", "- / -"))
    row((0.28, "Alíq. Efetiva Municipal - IBS", V), (0.24, "Valor Apurado Municipal - IBS", V),
        (0.24, "Alíq. Efetiva Estadual - IBS", V), (0.24, "Valor Apurado Estadual - IBS", V))
    row((0.28, "Valor Total Apurado - IBS", V), (0.24, "Alíquota - CBS", V),
        (0.24, "Alíquota Efetiva - CBS", V), (0.24, "Valor Total Apurado - CBS", V))
    row((0.28, "VALOR TOTAL DA NFS-e", "", True), (0.24, "VALOR DA OPERAÇÃO / SERVIÇO", d["valor_servico"]),
        (0.24, "Desconto Incondicionado", V), (0.24, "Desconto Condicionado", V))
    row((0.28, "Total das Retenções (ISSQN / Federais)", V), (0.24, "VALOR LÍQUIDO DA NFS-e", d["valor_liquido"]),
        (0.24, "Total do IBS/CBS", "R$ 0,00"), (0.24, "VALOR LÍQUIDO DA NFS-e + IBS/CBS", d["valor_liquido"], True))

    # --- Informacoes complementares
    linha()
    c.setFillGray(0.93)
    c.rect(mx, y - 5 * mm, inner, 5 * mm, stroke=0, fill=1)
    c.setFillGray(0)
    c.setFont("Helvetica-Bold", 7.2)
    c.drawString(mx + 1.5 * mm, y - 3.5 * mm, "INFORMAÇÕES COMPLEMENTARES")
    y -= 9 * mm
    c.setFont("Helvetica", 7.8)
    for ln in _quebrar(c, d["info"], "Helvetica", 7.8, inner - 3 * mm)[:20]:
        c.drawString(mx + 1.5 * mm, y, ln)
        y -= 3.5 * mm

    # --- Rodape de cientificacao
    ry = base + 2 * mm
    altura = rodape_h - 2 * mm
    c.setLineWidth(0.5)
    c.rect(mx + 1 * mm, ry, inner - 2 * mm, altura)
    c.line(mx + inner * 0.25, ry, mx + inner * 0.25, ry + altura)
    c.line(mx + inner * 0.5, ry, mx + inner * 0.5, ry + altura)
    c.setFont("Helvetica-Bold", 6.5)
    c.drawString(mx + 2.5 * mm, ry + altura - 3.5 * mm, "DATA CIENTIFICAÇÃO:")
    c.drawString(mx + inner * 0.25 + 1.5 * mm, ry + altura - 3.5 * mm, "IDENTIFICAÇÃO E ASSINATURA")
    c.drawString(mx + inner * 0.5 + 1.5 * mm, ry + altura - 3.5 * mm, "N° NFS-e / CHAVE NFS-e")
    c.setFont("Helvetica", 7)
    c.drawString(mx + inner * 0.5 + 1.5 * mm, ry + 1.8 * mm, f"{d['numero']} / {d['chave']}")
    c.showPage()
    c.save()
    return buf.getvalue()
