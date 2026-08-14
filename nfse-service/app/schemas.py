"""Modelos Pydantic de request/response do microserviço. Um arquivo só —
o serviço é pequeno o suficiente pra não justificar split por endpoint."""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class CertificadoRequest(BaseModel):
    pfx_base64: str
    senha: str | None = None
    documento_esperado: str | None = None


class CertificadoResponse(BaseModel):
    titular: str | None = None
    cnpj: str | None = None
    valido_ate: str
    dias_para_expirar: int
    alerta: str | None = None
    alerta_titularidade: str | None = None
    pfx_cifrado: str
    senha_cifrada: str


class ErroTraduzido(BaseModel):
    codigo: str
    titulo: str
    explicacao: str
    acao_sugerida: str
    descricao_original: str = ""
    complemento: str | None = None
