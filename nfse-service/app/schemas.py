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


class PrestadorData(BaseModel):
    documento: str
    inscricao_municipal: str | None = None
    municipio_ibge: str
    optante_simples_nacional: int
    regime_apuracao_sn: int | None = None
    codigo_tributacao_nacional: str


class TomadorData(BaseModel):
    documento: str
    nome: str
    email: str | None = None


class EmitirRequest(BaseModel):
    ambiente: str
    certificado_pfx_cifrado: str
    certificado_senha_cifrada: str
    serie: str
    numero: int
    competencia: date
    prestador: PrestadorData
    tomador: TomadorData
    descricao_servico: str
    valor: float


class EmitirResponse(BaseModel):
    autorizada: bool
    dps_id: str
    chave_acesso: str | None = None
    numero_nfse: str | None = None
    xml_dps_base64: str
    xml_nfse_base64: str | None = None
    pdf_base64: str | None = None
    erros: list[ErroTraduzido] = []


class CancelarRequest(BaseModel):
    ambiente: str
    certificado_pfx_cifrado: str
    certificado_senha_cifrada: str
    chave_acesso: str
    autor_documento: str
    motivo_codigo: str | None = None
    motivo_texto: str | None = None


class CancelarResponse(BaseModel):
    registrado: bool
    xml_evento_base64: str | None = None
    erros: list[ErroTraduzido] = []


class ConsultarResponse(BaseModel):
    encontrada: bool
    bruta: dict
