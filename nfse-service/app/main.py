import base64
from datetime import datetime, timedelta, timezone
from decimal import Decimal

# Brasil nao observa horario de verao desde 2019 -- offset fixo, sem
# precisar de banco de fusos horarios (zoneinfo) so por causa disso.
BRASILIA_TZ = timezone(timedelta(hours=-3))

from fastapi import Depends, FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.auth import verificar_segredo
from app.crypto import cifrar, decifrar
from app.schemas import (
    CancelarRequest,
    CancelarResponse,
    CertificadoRequest,
    CertificadoResponse,
    ConsultarResponse,
    EmitirRequest,
    EmitirResponse,
)
from nfse_core import (
    CertificateError,
    conferir_titularidade,
    inspecionar,
    DpsData,
    build_dps_xml,
    sign_dps,
    EventoCancelamentoData,
    build_evento_cancelamento_xml,
    sign_evento,
    SefinClient,
    SefinError,
    ler_resposta_emissao,
    ler_resposta_evento,
    erros_de_falha,
)

app = FastAPI(title="PsiAgente NFS-e Service")

AMBIENTE_TP = {"homologacao": 2, "producao": 1}


def _b64(dados: bytes) -> str:
    return base64.b64encode(dados).decode()


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    """Sanitizar erros de validação para não ecoar dados sensíveis (senha, PFX).
    Retorna apenas uma mensagem genérica sem detalhe por campo."""
    return JSONResponse(
        status_code=422,
        content={"detail": "Requisicao invalida."},
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post(
    "/certificado/validar",
    response_model=CertificadoResponse,
    dependencies=[Depends(verificar_segredo)],
)
async def validar_certificado(req: CertificadoRequest) -> CertificadoResponse:
    try:
        info = inspecionar(req.pfx_base64, req.senha)
    except CertificateError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    alerta_titularidade = None
    if req.documento_esperado:
        alerta_titularidade = conferir_titularidade(info, req.documento_esperado)

    return CertificadoResponse(
        titular=info.titular,
        cnpj=info.cnpj,
        valido_ate=info.valido_ate.date().isoformat(),
        dias_para_expirar=info.dias_para_expirar,
        alerta=info.alerta,
        alerta_titularidade=alerta_titularidade,
        pfx_cifrado=cifrar(req.pfx_base64),
        senha_cifrada=cifrar(req.senha or ""),
    )


@app.post("/emitir", response_model=EmitirResponse, dependencies=[Depends(verificar_segredo)])
async def emitir(req: EmitirRequest) -> EmitirResponse:
    if req.ambiente not in AMBIENTE_TP:
        raise HTTPException(status_code=400, detail="Ambiente invalido.")

    pfx = decifrar(req.certificado_pfx_cifrado)
    senha = decifrar(req.certificado_senha_cifrada)

    dados = DpsData(
        tp_amb=AMBIENTE_TP[req.ambiente],
        # dhEmi em horario de Brasilia (-03:00), nao UTC: testado em
        # 15/08/2026 contra a SEFIN homologacao real e o erro E0008 ("data
        # no futuro") persistiu identico com ate 2h de folga em UTC --
        # hipotese e que o validador da SEFIN compara os digitos do horario
        # de forma ingenua (sem respeitar o offset do ISO8601), entao UTC
        # sempre parece 3h no futuro em relacao ao horario local deles.
        dh_emi=datetime.now(BRASILIA_TZ) - timedelta(seconds=30),
        serie=req.serie,
        numero=req.numero,
        competencia=req.competencia,
        prest_cnpj=req.prestador.documento,
        prest_im=req.prestador.inscricao_municipal,
        c_loc_emi=req.prestador.municipio_ibge,
        op_simp_nac=req.prestador.optante_simples_nacional,
        reg_ap_trib_sn=req.prestador.regime_apuracao_sn,
        toma_cpf_cnpj=req.tomador.documento,
        toma_nome=req.tomador.nome,
        toma_email=req.tomador.email,
        c_trib_nac=req.prestador.codigo_tributacao_nacional,
        x_desc_serv=req.descricao_servico,
        v_serv=Decimal(str(req.valor)),
    )

    try:
        xml = build_dps_xml(dados)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    assinado = sign_dps(xml, pfx, senha)

    cliente = SefinClient(req.ambiente, pfx, senha)
    try:
        try:
            bruta = await cliente.emitir_dps(assinado)
        except SefinError as exc:
            erros = erros_de_falha(exc) or [{
                "codigo": "?",
                "descricao_original": str(exc),
                "titulo": "Falha de comunicacao com a SEFIN",
                "explicacao": str(exc),
                "acao_sugerida": "Tente novamente em instantes.",
            }]
            return EmitirResponse(
                autorizada=False,
                dps_id=dados.dps_id,
                xml_dps_base64=_b64(assinado),
                erros=erros,
            )
        resultado = ler_resposta_emissao(bruta)
    finally:
        await cliente.close()

    pdf_base64 = None
    if resultado.autorizada and resultado.chave_acesso:
        pdf_bytes = await SefinClient.fetch_danfse_pdf(req.ambiente, pfx, senha, resultado.chave_acesso)
        if pdf_bytes:
            pdf_base64 = _b64(pdf_bytes)

    return EmitirResponse(
        autorizada=resultado.autorizada,
        dps_id=dados.dps_id,
        chave_acesso=resultado.chave_acesso,
        numero_nfse=resultado.numero_nfse,
        xml_dps_base64=_b64(assinado),
        xml_nfse_base64=_b64(resultado.xml_nfse) if resultado.xml_nfse else None,
        pdf_base64=pdf_base64,
        erros=resultado.erros,
    )


@app.post("/cancelar", response_model=CancelarResponse, dependencies=[Depends(verificar_segredo)])
async def cancelar(req: CancelarRequest) -> CancelarResponse:
    if req.ambiente not in AMBIENTE_TP:
        raise HTTPException(status_code=400, detail="Ambiente invalido.")

    pfx = decifrar(req.certificado_pfx_cifrado)
    senha = decifrar(req.certificado_senha_cifrada)

    dados = EventoCancelamentoData(
        chave_nfse=req.chave_acesso,
        tp_amb=AMBIENTE_TP[req.ambiente],
        dh_evento=datetime.now(timezone.utc),
        autor_cpf_cnpj=req.autor_documento,
        c_motivo=req.motivo_codigo or "1",
        x_motivo=req.motivo_texto or "Cancelamento solicitado pelo prestador",
    )

    try:
        xml = build_evento_cancelamento_xml(dados)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    assinado = sign_evento(xml, pfx, senha)

    cliente = SefinClient(req.ambiente, pfx, senha)
    try:
        try:
            bruta = await cliente.registrar_evento(req.chave_acesso, assinado)
        except SefinError as exc:
            erros = erros_de_falha(exc) or [{
                "codigo": "?",
                "descricao_original": str(exc),
                "titulo": "Falha de comunicacao com a SEFIN",
                "explicacao": str(exc),
                "acao_sugerida": "Tente novamente em instantes.",
            }]
            return CancelarResponse(registrado=False, erros=erros)
        resultado = ler_resposta_evento(bruta)
    finally:
        await cliente.close()

    return CancelarResponse(
        registrado=resultado.registrado,
        xml_evento_base64=_b64(resultado.xml_evento) if resultado.xml_evento else None,
        erros=resultado.erros,
    )


@app.get("/consultar", response_model=ConsultarResponse, dependencies=[Depends(verificar_segredo)])
async def consultar(
    ambiente: str,
    chave_acesso: str,
    certificado_pfx_cifrado: str,
    certificado_senha_cifrada: str,
) -> ConsultarResponse:
    if ambiente not in AMBIENTE_TP:
        raise HTTPException(status_code=400, detail="Ambiente invalido.")

    pfx = decifrar(certificado_pfx_cifrado)
    senha = decifrar(certificado_senha_cifrada)

    cliente = SefinClient(ambiente, pfx, senha)
    try:
        try:
            bruta = await cliente.consultar_nfse(chave_acesso)
        except SefinError:
            return ConsultarResponse(encontrada=False, bruta={})
    finally:
        await cliente.close()

    return ConsultarResponse(encontrada=True, bruta=bruta)
