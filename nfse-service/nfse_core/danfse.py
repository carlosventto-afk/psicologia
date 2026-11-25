"""DANFSe local (layout "DANFSe v2.0"): desenha o PDF a partir do XML autorizado.

Desde 03/08/2026 (Nota Tecnica 008/2026) o governo nao entrega mais o PDF pela API do
ADN; o emissor gera a representacao grafica a partir do XML. As medidas abaixo foram
lidas do PDF oficial de referencia (DANFSe v2.0, gerado pelo Emissor Nacional): A4
595x842 pt, grade de 4 colunas, linha so no topo de cada bloco, fontes Arial 6/7/9 pt.
Tolerante: campo ausente no XML vira "-".
"""
from __future__ import annotations

import io
from datetime import datetime
from pathlib import Path

from lxml import etree
from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

LOGO = Path(__file__).parent / "assets" / "logo_nfse.png"

# Mesmo formato do QR do PDF oficial (sem barra antes do "?").
CONSULTA_PUBLICA = {
    "producao": "https://www.nfse.gov.br/ConsultaPublica?tpc=1&chave={chave}",
    "homologacao": "https://www.producaorestrita.nfse.gov.br/ConsultaPublica?tpc=1&chave={chave}",
}

V = "-"
TIPO_EMITENTE = {"1": "Prestador", "2": "Tomador", "3": "Intermediário"}
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


def url_consulta(chave: str, ambiente: str = "producao") -> str:
    return CONSULTA_PUBLICA.get(ambiente, CONSULTA_PUBLICA["producao"]).format(chave=chave)


# ---------------------------------------------------------------------------
# Leitura do XML
# ---------------------------------------------------------------------------

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


def _fone(valor: str) -> str:
    d = "".join(ch for ch in valor if ch.isdigit())
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
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
        "fone": _fone(_t(no, "fone")),
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
    for chave, tag, fmt in (("im", "IM", str), ("fone", "fone", _fone), ("email", "email", str)):
        valor = _t(prest_dps, tag)
        if valor:
            emit[chave] = fmt(valor)

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
        "tp_emit": TIPO_EMITENTE.get(_t(inf, "tpEmit"), "Prestador"),
        "situacao": SITUACAO.get(_t(inf, "cStat"), V),
        "finalidade": _t(inf, "finNFSe") or V,
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
        "irrf": _moeda(_t(inf, "vRetIRRF")),
        "cp": _moeda(_t(inf, "vRetCP")),
        "csll": _moeda(_t(inf, "vRetCSLL")),
        "pis": _moeda(_t(inf, "vPis")),
        "cofins": _moeda(_t(inf, "vCofins")),
        "valor_servico": _moeda(_t(inf, "vServ")),
        "valor_liquido": _moeda(v_liq),
        "info": "\n".join(x for x in (totais, compl) if x),
    }


# ---------------------------------------------------------------------------
# Desenho (coordenadas em pt, origem no topo esquerdo, como no PDF oficial)
# ---------------------------------------------------------------------------

PW, PH = 595.0, 842.0
X0 = 8.5039                       # borda esquerda da grade
COL = 144.5669                    # largura de cada uma das 4 colunas
XS = [X0 + i * COL for i in range(5)]
PAD = 3.4016                      # recuo do texto dentro da celula
PASSO = 19.0733                   # altura de uma linha de campos
NEGRITO, NORMAL = "Helvetica-Bold", "Helvetica"
LARGURA_TEXTO = XS[4] - XS[0] - 2 * PAD


def _ajustar(texto: str, fonte: str, tam: float, largura: float) -> str:
    """Cabe na celula: corta por palavras e termina em ' ...' (como o PDF oficial)."""
    if stringWidth(texto, fonte, tam) <= largura:
        return texto
    palavras = texto.split(" ")
    while len(palavras) > 1 and stringWidth(" ".join(palavras) + " ...", fonte, tam) > largura:
        palavras.pop()
    candidato = " ".join(palavras) + " ..."
    while len(candidato) > 4 and stringWidth(candidato, fonte, tam) > largura:
        candidato = candidato[:-5].rstrip() + " ..."
    return candidato


def _quebrar(texto: str, fonte: str, tam: float, largura: float) -> list[str]:
    linhas: list[str] = []
    for paragrafo in (texto or "").split("\n"):
        atual = ""
        for palavra in paragrafo.split():
            teste = f"{atual} {palavra}".strip()
            if stringWidth(teste, fonte, tam) <= largura:
                atual = teste
            else:
                if atual:
                    linhas.append(atual)
                atual = palavra
        linhas.append(atual)
    return linhas


def gerar_danfse(xml_nfse: bytes | str, ambiente: str = "producao", comprimir: bool = True) -> bytes:
    """PDF (A4, 1 pagina) do DANFSe v2.0. Levanta ValueError se o XML nao for uma NFS-e."""
    d = extrair_campos(xml_nfse)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(PW, PH), pageCompression=1 if comprimir else 0)
    c.setTitle(f"DANFSe {d['numero']}")
    c.setCreator("PsiAgente")

    def Y(y: float) -> float:
        return PH - y

    def texto(x, y, s, negrito=False, tam=7.0, centro=False, cor=0.0):
        c.setFillGray(cor)
        c.setFont(NEGRITO if negrito else NORMAL, tam)
        (c.drawCentredString if centro else c.drawString)(x, Y(y), s)
        c.setFillGray(0)

    def linha_h(y, lw=0.5):
        c.setLineWidth(lw)
        c.line(XS[0], Y(y), XS[4], Y(y))

    def cinza(x0, y0, x1, y1):
        c.setFillGray(0.949)
        c.rect(x0, Y(y1), x1 - x0, y1 - y0, stroke=0, fill=1)
        c.setFillGray(0)

    # --- Moldura
    c.setLineWidth(1)
    c.rect(5, Y(837), 585, 832)

    # --- Cabecalho
    for i in range(3):
        cinza((XS[0], XS[1], XS[3])[i], 5.67, (XS[1], XS[3], XS[4])[i], 39.68)
    if LOGO.exists():
        c.drawImage(str(LOGO), 11.9055, Y(10.3229 + 22.9165), 115.6536, 22.9165, mask="auto")
    else:
        texto(11.9, 28, "NFS-e", negrito=True, tam=14)
    centro = (XS[1] + XS[3]) / 2
    texto(centro, 20.77, "DANFSe v2.0", negrito=True, tam=9, centro=True)
    texto(centro, 31.12, "Documento Auxiliar da NFS-e", negrito=True, tam=9, centro=True)
    if ambiente != "producao":
        texto(centro, 37.6, "SEM VALIDADE FISCAL - AMBIENTE DE HOMOLOGAÇÃO", negrito=True, tam=5.5, centro=True, cor=0.0)
    texto(XS[3] + PAD, 18.73, f"Município: {d['municipio'] or V}", tam=8)
    texto(XS[3] + PAD, 25.94, f"Ambiente Gerador: {d['amb_ger']}", tam=6)
    texto(XS[3] + PAD, 32.74, f"Tipo de Ambiente: {d['tp_amb']}", tam=6)
    linha_h(39.93)

    # --- Chave de acesso, numeros, QR Code
    texto(XS[0] + PAD, 51.00, "CHAVE DE ACESSO DA NFS-e", negrito=True)
    texto(XS[0] + PAD, 58.94, d["chave"] or V)
    for base, campos in (
        (71.23, (("NÚMERO DA NFS-e", d["numero"]), ("COMPETÊNCIA DA NFS-e", d["competencia"]),
                 ("DATA E HORA DA EMISSÃO DA NFS-e", d["emissao_nfse"]))),
        (91.45, (("NÚMERO DA DPS", d["ndps"]), ("SÉRIE DA DPS", d["serie"]),
                 ("DATA E HORA DA EMISSÃO DA DPS", d["emissao_dps"]))),
    ):
        for i, (rotulo, valor) in enumerate(campos):
            texto(XS[i] + PAD, base, rotulo, negrito=True)
            texto(XS[i] + PAD, base + 7.93, valor)

    qr = QrCodeWidget(url_consulta(d["chave"], ambiente), barLevel="M", barBorder=2)
    qx0, qy0, qx1, qy1 = qr.getBounds()
    lado = 45.0
    desenho = Drawing(lado, lado, transform=[lado / (qx1 - qx0), 0, 0, lado / (qy1 - qy0), 0, 0])
    desenho.add(qr)
    renderPDF.draw(desenho, c, 491.9882, Y(44.7642 + lado))
    for i, ln in enumerate(("A autenticidade desta NFS-e pode ser verificada",
                            "pela leitura deste código QR ou pela consulta da",
                            "chave de acesso no portal nacional da NFS-e")):
        texto(XS[3] + PAD, 97.41 + 6.795 * i, ln, tam=6)

    # --- Emitente da NFS-e / situacao
    cinza(XS[0], 105.11, XS[1], 125.33)
    for i, (rotulo, valor) in enumerate((("EMITENTE DA NFS-e", d["tp_emit"]), ("SITUAÇÃO DA NFS-e", d["situacao"]),
                                         ("FINALIDADE", d["finalidade"]))):
        texto(XS[i] + PAD, 111.68, rotulo, negrito=True)
        texto(XS[i] + PAD, 119.61, valor)

    # --- Blocos em grade
    def secao(topo, titulo, linhas):
        """Linha no topo, celula cinza com o titulo e as linhas de campos. Devolve o topo do proximo bloco."""
        linha_h(topo)
        cinza(XS[0], topo + 0.25, XS[1], topo + 0.25 + 19.08)
        texto(XS[0] + PAD, topo + 6.82, titulo, negrito=True)
        for i, celulas in enumerate(linhas):
            base = topo + 5.88 + i * PASSO
            for cel in celulas:
                col, span, rotulo, valor = cel[:4]
                if len(cel) > 4 and cel[4]:
                    y0 = topo + 0.25 + i * PASSO
                    cinza(XS[col], y0, XS[col + span], y0 + 19.08)
                largura = COL * span - 2 * PAD
                texto(XS[col] + PAD, base, _ajustar(rotulo, NEGRITO, 6, largura), negrito=True, tam=6)
                texto(XS[col] + PAD, base + 7.73, _ajustar(valor or V, NORMAL, 7, largura))
        return topo + len(linhas) * PASSO + 0.5

    emit, toma = d["emit"], d["toma"]
    topo = 125.58
    topo = secao(topo, "PRESTADOR / FORNECEDOR", [
        [(1, 1, "CNPJ / CPF / NIF", emit["doc"]), (2, 1, "Indicador Municipal (Inscrição)", emit["im"]),
         (3, 1, "Telefone", emit["fone"])],
        [(0, 2, "Nome / Nome Empresarial", emit["nome"]), (2, 1, "Município / Sigla UF", emit["mun_uf"]),
         (3, 1, "Código IBGE / CEP", emit["ibge_cep"])],
        [(0, 2, "Endereço", emit["end"]), (2, 2, "E-mail", emit["email"])],
        [(0, 1, "Simples Nacional na Data de Competência", d["regime_sn"]),
         (1, 3, "Regime de Apuração Tributária pelo SN", d["regime_ap"])],
    ])
    topo = secao(topo, "TOMADOR / ADQUIRENTE", [
        [(1, 1, "CNPJ / CPF / NIF", toma["doc"]), (2, 1, "Indicador Municipal (Inscrição)", toma["im"]),
         (3, 1, "Telefone", toma["fone"])],
        [(0, 2, "Nome / Nome Empresarial", toma["nome"]), (2, 1, "Município / Sigla UF", toma["mun_uf"]),
         (3, 1, "Código IBGE / CEP", toma["ibge_cep"])],
        [(0, 2, "Endereço", toma["end"]), (2, 2, "E-mail", toma["email"])],
    ])

    # Destinatario e intermediario (nao informados nesta emissao)
    for aviso in ("DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e",
                  "INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e"):
        linha_h(topo)
        texto((XS[0] + XS[4]) / 2, topo + 6.71, aviso, centro=True)
        topo += 8.425

    # Servico prestado (descricao com altura variavel)
    desc = _quebrar(d["serv_desc"], NORMAL, 7, LARGURA_TEXTO)[:30] or [V]
    linha_h(topo)
    cinza(XS[0], topo + 0.25, XS[1], topo + 0.25 + 19.08)
    texto(XS[0] + PAD, topo + 6.82, "SERVIÇO PRESTADO", negrito=True)
    for col, span, rotulo, valor in (
        (1, 1, "Código de Tributação Nacional/Municipal", d["serv_cod"]),
        (2, 1, "Código da NBS", d["nbs"]),
        (3, 1, "Local da Prestação / Sigla UF / País", d["serv_local"]),
    ):
        largura = COL * span - 2 * PAD
        texto(XS[col] + PAD, topo + 5.88, _ajustar(rotulo, NEGRITO, 6, largura), negrito=True, tam=6)
        texto(XS[col] + PAD, topo + 13.61, _ajustar(valor, NORMAL, 7, largura))
    texto(XS[0] + PAD, topo + 25.78, _ajustar(d["serv_trib_nac"] or V, NORMAL, 7, LARGURA_TEXTO))
    texto(XS[0] + PAD, topo + 37.13, "Descrição do Serviço", negrito=True, tam=6)
    for i, ln in enumerate(desc):
        texto(XS[0] + PAD, topo + 44.85 + 7.92 * i, ln)
    topo += 50.82 + 7.92 * (len(desc) - 1)

    topo = secao(topo, "TRIBUTAÇÃO MUNICIPAL (ISSQN)", [
        [(1, 1, "Tipo de Tributação do ISSQN", d["trib_issqn"]),
         (2, 2, "Município / Sigla UF / País de Incidência do ISSQN", d["incidencia"])],
        [(0, 1, "BC ISSQN", d["bc_issqn"]), (1, 1, "Alíquota Aplicada", d["aliq"]),
         (2, 1, "Retenção do ISSQN", d["ret_issqn"]), (3, 1, "ISSQN Apurado", d["issqn"])],
    ])
    topo = secao(topo, "TRIBUTAÇÃO FEDERAL (EXCETO CBS)", [
        [(1, 1, "IRRF", d["irrf"]), (2, 1, "Contribuição Previdenciária - Retida", d["cp"]),
         (3, 1, "Contribuições Sociais - Retidas", d["csll"])],
        [(0, 1, "PIS - Débito Apuração Própria", d["pis"]), (1, 1, "COFINS - Débito Apuração Própria", d["cofins"]),
         (2, 2, "Descrição Contrib. Sociais - Retidas", V)],
    ])
    topo = secao(topo, "TRIBUTAÇÃO IBS/CBS", [
        [(1, 1, "CST / cClassTrib", "- / -"),
         (2, 2, "Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF", "- / - / - / -")],
        [(0, 1, "Exclusões e Reduções da Base de Cálculo", "R$ 0,00"),
         (1, 1, "Base de Cálculo Após Exclusões e Reduções", V),
         (2, 1, "Red. Alíquota IBS / Red. Alíquota CBS", "- / - / -"),
         (3, 1, "Alíquota - IBS UF / IBS Mun", "- / -")],
        [(0, 1, "Alíq. Efetiva Municipal - IBS", V), (1, 1, "Valor Apurado Municipal - IBS", V),
         (2, 1, "Alíq. Efetiva Estadual - IBS", V), (3, 1, "Valor Apurado Estadual - IBS", V)],
        [(0, 1, "Valor Total Apurado - IBS", V), (1, 1, "Alíquota - CBS", V),
         (2, 1, "Alíquota Efetiva - CBS", V), (3, 1, "Valor Total Apurado - CBS", V)],
    ])
    topo = secao(topo, "VALOR TOTAL DA NFS-e", [
        [(1, 1, "VALOR DA OPERAÇÃO / SERVIÇO", d["valor_servico"]), (2, 1, "Desconto Incondicionado", V),
         (3, 1, "Desconto Condicionado", V)],
        [(0, 1, "Total das Retenções (ISSQN / Federais)", V), (1, 1, "VALOR LÍQUIDO DA NFS-e", d["valor_liquido"]),
         (2, 1, "Total do IBS/CBS", "R$ 0,00"),
         (3, 1, "VALOR LÍQUIDO DA NFS-e + IBS/CBS", d["valor_liquido"], True)],
    ])

    # --- Informacoes complementares
    linha_h(topo)
    texto(XS[0] + PAD, topo + 6.81, "INFORMAÇÕES COMPLEMENTARES", negrito=True)
    for i, ln in enumerate(_quebrar(d["info"], NORMAL, 7, LARGURA_TEXTO)[:30]):
        texto(XS[0] + PAD, topo + 26.92 + 7.92 * i, ln)

    # --- Rodape de cientificacao
    c.setLineWidth(1)
    for x0, x1 in ((9.0039, 153.5709), (153.5709, 298.1378), (298.1378, 587.2717)):
        c.line(x0, Y(796.30), x0, Y(816.38))
        c.line(x1, Y(796.30), x1, Y(816.38))
        c.line(x0 - 0.5, Y(795.80), x1 + 0.5, Y(795.80))
        c.line(x0 - 0.5, Y(815.88), x1 + 0.5, Y(815.88))
    texto(12.91, 801.93, "DATA CIENTIFICAÇÃO:", negrito=True, tam=6)
    texto(157.47, 801.93, "IDENTIFICAÇÃO E ASSINATURA", negrito=True, tam=6)
    texto(302.04, 801.93, "N° NFS-e / CHAVE NFS-e", negrito=True, tam=6)
    texto(302.04, 809.66, f"{d['numero']} / {d['chave']}")

    c.showPage()
    c.save()
    return buf.getvalue()
