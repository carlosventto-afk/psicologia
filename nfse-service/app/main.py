from fastapi import Depends, FastAPI, HTTPException

from app.auth import verificar_segredo
from app.crypto import cifrar
from app.schemas import CertificadoRequest, CertificadoResponse
from nfse_core import CertificateError, conferir_titularidade, inspecionar

app = FastAPI(title="PsiAgente NFS-e Service")


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
