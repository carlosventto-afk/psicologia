# Emissão de NFS-e (item 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emitir NFS-e no padrão Nacional direto pelo PsiAgente, pra pacientes marcados como "Nota Fiscal" (item 6), com envio automático por e-mail e sem sair do sistema.

**Architecture:** Um microserviço Python novo (`nfse-service/`, FastAPI, vendorizando `nfse_core/` do kit) faz tudo que envolve o certificado digital e a comunicação com a SEFIN. O Next.js orquestra o flude de negócio (quem emite, numeração, persistência, e-mail) e chama o microserviço via HTTP interno, autenticado por segredo compartilhado — nunca lida com o certificado em texto puro.

**Tech Stack:** Next.js 16 App Router (Server Components/Actions) + Supabase Postgres (já em uso no projeto). Python 3.11 + FastAPI + o kit `nfse_core` (lxml, cryptography, httpx) pro microserviço novo. Resend (API HTTP) pro e-mail — primeira integração de e-mail direta neste app. Sem framework de teste automatizado neste projeto — verificação via scripts ad-hoc (Node com `@supabase/supabase-js`/`pg`, Python com `fastapi.testclient`), mesmo padrão já usado nos planos anteriores.

**Spec:** `docs/superpowers/specs/2026-08-14-nfse-emissao-design.md`

## Global Constraints

- Licenciamento do kit (`NotaFiscal/nfse-nacional-kit`) já liberado pelo autor pro uso no PsiAgente — confirmado pelo usuário, não é mais bloqueio.
- Certificado A1 (`.pfx` + senha) **nunca** fica em texto puro no Node/Next.js — toda cifra/decifra acontece dentro do microserviço Python, que já usa `cryptography` pra isso.
- Todo profissional novo começa em `ambiente = 'homologacao'`. A troca pra `producao` é feita pelo próprio profissional, com confirmação explícita de que é **irreversível** — e o banco impede reverter via trigger (defesa em profundidade, não só checagem na Server Action).
- `NotaFiscal` referencia `PagamentoSessao` (valor realmente pago), não `Sessao`/`Paciente.valor_sessao` (preço nominal) — mesma fonte de dados que o item 8 (Carnê-Leão) já usa, por ser a correta pra um documento fiscal.
- Numeração (`proximo_numero`) é consumida com `UPDATE ... RETURNING` transacional, nunca com `SELECT` seguido de `UPDATE` separado.
- Sem gerador de PDF próprio nesta v1 — se a API do DANFSe (ADN) estiver fora do ar, a nota fica autorizada normalmente (XML é o documento fiscal válido) e não há fallback de PDF.
- Todas as tabelas novas seguem o padrão de RLS já estabelecido no projeto: coluna `owner uuid default auth.uid()`, 4 policies (`select`/`insert`/`update`/`delete`) checando `owner = auth.uid() or public.is_admin()`.
- Sem framework de teste automatizado — cada task se verifica com um script ad-hoc contra dados descartáveis, sempre limpos ao final (mesmo padrão de todas as sessões anteriores deste projeto).

---

## Task 1: Vendorizar o kit + esqueleto do microserviço FastAPI

**Files:**
- Create: `nfse-service/nfse_core/` (cópia de `C:\Users\Administrador\Desktop\Projetos\NotaFiscal\nfse-nacional-kit\nfse-nacional-kit\nfse_core\`)
- Create: `nfse-service/app/__init__.py`
- Create: `nfse-service/app/auth.py`
- Create: `nfse-service/app/main.py`
- Create: `nfse-service/requirements.txt`
- Create: `nfse-service/.env.example`
- Create: `nfse-service/.gitignore`

**Interfaces:**
- Produces: `app.auth.verificar_segredo` (dependência FastAPI), app FastAPI em `app.main.app` com `GET /health`.

- [ ] **Step 1: Copiar o núcleo do kit pro repo**

```bash
mkdir -p "c:\Users\Administrador\Desktop\Projetos\Psicologia\nfse-service"
cp -r "C:\Users\Administrador\Desktop\Projetos\NotaFiscal\nfse-nacional-kit\nfse-nacional-kit\nfse_core" "c:\Users\Administrador\Desktop\Projetos\Psicologia\nfse-service\nfse_core"
```

Não modificar nenhum arquivo dentro de `nfse_core/` — é o núcleo já validado contra a SEFIN real (ver `docs/ARMADILHAS.md` do kit, não copiado, só referência).

- [ ] **Step 2: `requirements.txt`**

```
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
lxml>=5.2.0
cryptography>=42.0
httpx>=0.27.0
```

- [ ] **Step 3: `.gitignore`**

```
.env
*.pfx
*.pem
*.b64.txt
__pycache__/
*.pyc
```

- [ ] **Step 4: `.env.example`**

```
# Segredo compartilhado com o Next.js — mesmo valor da env var
# NFSE_SERVICE_SECRET do app principal. Gere com:
#   python -c "import secrets; print(secrets.token_urlsafe(32))"
NFSE_SERVICE_SECRET=

# Chave de cifra do certificado A1 em repouso (Fernet, 32 bytes url-safe base64).
# Gere com:
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# NUNCA reaproveitar essa chave de nenhuma outra parte do sistema.
NFSE_CERT_ENCRYPTION_KEY=
```

- [ ] **Step 5: `app/auth.py`**

```python
"""Autenticação do microserviço: segredo compartilhado no header, mesmo
padrão já usado em `/carne-leao-automatico` no app principal. Sem sessão de
usuário aqui — quem chama é sempre o Next.js, nunca o navegador."""
import os

from fastapi import Header, HTTPException


async def verificar_segredo(x_nfse_secret: str = Header(...)) -> None:
    esperado = os.environ.get("NFSE_SERVICE_SECRET")
    if not esperado or x_nfse_secret != esperado:
        raise HTTPException(status_code=401, detail="Nao autorizado.")
```

- [ ] **Step 6: `app/__init__.py`** (vazio)

```python
```

- [ ] **Step 7: `app/main.py`** (esqueleto — endpoints de negócio entram nas próximas tasks)

```python
from fastapi import FastAPI

app = FastAPI(title="PsiAgente NFS-e Service")


@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 8: Verificar que o app sobe e responde**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\nfse-service" && python -m venv .venv && .venv\Scripts\pip install -r requirements.txt -q && .venv\Scripts\python -c "
from fastapi.testclient import TestClient
from app.main import app
client = TestClient(app)
r = client.get('/health')
assert r.status_code == 200 and r.json() == {'status': 'ok'}, r.text
print('health check OK')
"
```

Expected: imprime `health check OK` sem erro.

- [ ] **Step 9: Verificar a dependência de autenticação isoladamente**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\nfse-service" && .venv\Scripts\python -c "
import os
os.environ['NFSE_SERVICE_SECRET'] = 'segredo-teste'
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from app.auth import verificar_segredo

app_teste = FastAPI()

@app_teste.get('/protegido', dependencies=[Depends(verificar_segredo)])
async def protegido():
    return {'ok': True}

client = TestClient(app_teste)
sem_header = client.get('/protegido')
print('sem header (esperado 422 - header obrigatorio ausente):', sem_header.status_code)
errado = client.get('/protegido', headers={'x-nfse-secret': 'errado'})
print('segredo errado (esperado 401):', errado.status_code)
certo = client.get('/protegido', headers={'x-nfse-secret': 'segredo-teste'})
print('segredo certo (esperado 200):', certo.status_code, certo.json())
"
```

Expected: `422` sem header, `401` com segredo errado, `200 {'ok': True}` com o segredo certo.

- [ ] **Step 10: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add nfse-service/ && git commit -m "feat: vendoriza kit NFS-e e cria esqueleto do microservico FastAPI"
```

---

## Task 2: Endpoint `/certificado/validar`

**Files:**
- Create: `nfse-service/app/crypto.py`
- Create: `nfse-service/app/schemas.py`
- Modify: `nfse-service/app/main.py`

**Interfaces:**
- Consumes: `nfse_core.certificado.inspecionar`, `conferir_titularidade`, `CertificateError` (Task 1's vendored kit).
- Produces: `app.crypto.cifrar(str) -> str`, `app.crypto.decifrar(str) -> str` (usadas pela Task 3 e 4). `POST /certificado/validar` retornando `CertificadoResponse`.

- [ ] **Step 1: `app/crypto.py`**

```python
"""Cifra/decifra do certificado A1 em repouso (Fernet). A chave nunca sai
deste processo — o Next.js só guarda e repassa o blob já cifrado."""
import os
from functools import lru_cache

from cryptography.fernet import Fernet


@lru_cache
def _fernet() -> Fernet:
    chave = os.environ["NFSE_CERT_ENCRYPTION_KEY"]
    return Fernet(chave.encode())


def cifrar(valor: str) -> str:
    return _fernet().encrypt(valor.encode()).decode()


def decifrar(valor: str) -> str:
    return _fernet().decrypt(valor.encode()).decode()
```

- [ ] **Step 2: `app/schemas.py`** (só a parte usada por esta task — as próximas tasks adicionam o resto no mesmo arquivo)

```python
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
```

- [ ] **Step 3: Adicionar o endpoint em `app/main.py`**

```python
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
```

- [ ] **Step 4: Verificar com um certificado de teste gerado localmente**

O kit já sabe gerar um certificado A1 sintético pra teste (mesmo usado em `exemplos/00_teste_local.py`, sem precisar de certificado real nem internet). Reaproveita isso pra testar o endpoint de ponta a ponta:

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\nfse-service" && .venv\Scripts\python -c "
import os, base64
os.environ['NFSE_SERVICE_SECRET'] = 'segredo-teste'
os.environ['NFSE_CERT_ENCRYPTION_KEY'] = __import__('cryptography.fernet', fromlist=['Fernet']).Fernet.generate_key().decode()

from datetime import datetime, timedelta, timezone
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

# certificado A1 sintetico, so pra teste local (mesma tecnica do 00_teste_local.py do kit)
chave = rsa.generate_private_key(public_exponent=65537, key_size=2048)
nome = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'EMPRESA TESTE LTDA:12345678000199')])
cert = (
    x509.CertificateBuilder()
    .subject_name(nome).issuer_name(nome).public_key(chave.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(datetime.now(timezone.utc))
    .not_valid_after(datetime.now(timezone.utc) + timedelta(days=365))
    .sign(chave, hashes.SHA256())
)
pfx_bytes = pkcs12.serialize_key_and_certificates(b'teste', chave, cert, None, serialization.BestAvailableEncryption(b'senha123'))
pfx_b64 = base64.b64encode(pfx_bytes).decode()

from fastapi.testclient import TestClient
from app.main import app
client = TestClient(app)

r = client.post('/certificado/validar', headers={'x-nfse-secret': 'segredo-teste'}, json={'pfx_base64': pfx_b64, 'senha': 'senha123', 'documento_esperado': '12345678000199'})
print('status:', r.status_code)
body = r.json()
print('titular:', body.get('titular'))
print('cnpj:', body.get('cnpj'))
print('alerta_titularidade (esperado None - mesmo CNPJ):', body.get('alerta_titularidade'))
assert r.status_code == 200
assert body['cnpj'] == '12345678000199'
assert body['alerta_titularidade'] is None

r2 = client.post('/certificado/validar', headers={'x-nfse-secret': 'segredo-teste'}, json={'pfx_base64': pfx_b64, 'senha': 'senha-errada'})
print('senha errada (esperado 400):', r2.status_code)
assert r2.status_code == 400

r3 = client.post('/certificado/validar', headers={'x-nfse-secret': 'segredo-teste'}, json={'pfx_base64': pfx_b64, 'senha': 'senha123', 'documento_esperado': '99999999000199'})
print('titularidade diferente (esperado aviso):', r3.json().get('alerta_titularidade'))
assert r3.json()['alerta_titularidade'] is not None

print('tudo OK')
"
```

Expected: `status: 200`, CNPJ batendo, sem aviso de titularidade quando o documento esperado é igual, `400` com senha errada, aviso presente quando o documento esperado é diferente, `tudo OK` no final.

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add nfse-service/app/ && git commit -m "feat: endpoint /certificado/validar no microservico de NFS-e"
```

---

## Task 3: Endpoint `/emitir`

**Files:**
- Modify: `nfse-service/app/schemas.py`
- Modify: `nfse-service/app/main.py`

**Interfaces:**
- Consumes: `app.crypto.decifrar` (Task 2), `nfse_core.{DpsData, build_dps_xml, sign_dps, SefinClient, SefinError, ler_resposta_emissao, erros_de_falha}`.
- Produces: `POST /emitir` retornando `EmitirResponse` — consumida pela Server Action da Task 11 (`emitirNotaFiscal`).

- [ ] **Step 1: Adicionar os modelos em `app/schemas.py`**

```python
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
```

- [ ] **Step 2: Adicionar o endpoint em `app/main.py`**

```python
import base64
from datetime import datetime, timezone
from decimal import Decimal

from app.crypto import decifrar
from app.schemas import EmitirRequest, EmitirResponse
from nfse_core import (
    DpsData, build_dps_xml, sign_dps,
    SefinClient, SefinError,
    ler_resposta_emissao, erros_de_falha,
)

AMBIENTE_TP = {"homologacao": 2, "producao": 1}


def _b64(dados: bytes) -> str:
    return base64.b64encode(dados).decode()


@app.post("/emitir", response_model=EmitirResponse, dependencies=[Depends(verificar_segredo)])
async def emitir(req: EmitirRequest) -> EmitirResponse:
    if req.ambiente not in AMBIENTE_TP:
        raise HTTPException(status_code=400, detail="Ambiente invalido.")

    pfx = decifrar(req.certificado_pfx_cifrado)
    senha = decifrar(req.certificado_senha_cifrada)

    dados = DpsData(
        tp_amb=AMBIENTE_TP[req.ambiente],
        dh_emi=datetime.now(timezone.utc),
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
```

Mover o `import` do topo do arquivo (`base64`, `datetime`, `Decimal`, etc.) pro cabeçalho de `main.py` junto dos já existentes, em vez de inline — o bloco acima está separado só pra leitura do plano.

- [ ] **Step 3: Verificar a construção/assinatura da DPS sem depender da SEFIN de verdade**

Este passo confirma que o endpoint monta e assina o XML corretamente (a parte 100% sob nosso controle); a chamada de rede real à SEFIN só é confirmável em homologação de verdade (Task 13). Usa o mesmo certificado sintético da Task 2 e injeta uma resposta fake da SEFIN pra isolar a parte de rede:

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\nfse-service" && .venv\Scripts\python -c "
import os, base64
os.environ['NFSE_SERVICE_SECRET'] = 'segredo-teste'
os.environ['NFSE_CERT_ENCRYPTION_KEY'] = __import__('cryptography.fernet', fromlist=['Fernet']).Fernet.generate_key().decode()

from datetime import datetime, timedelta, timezone
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

chave = rsa.generate_private_key(public_exponent=65537, key_size=2048)
nome = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'EMPRESA TESTE LTDA:12345678000199')])
cert = (
    x509.CertificateBuilder()
    .subject_name(nome).issuer_name(nome).public_key(chave.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(datetime.now(timezone.utc))
    .not_valid_after(datetime.now(timezone.utc) + timedelta(days=365))
    .sign(chave, hashes.SHA256())
)
pfx_bytes = pkcs12.serialize_key_and_certificates(b'teste', chave, cert, None, serialization.BestAvailableEncryption(b'senha123'))
pfx_b64 = base64.b64encode(pfx_bytes).decode()

from app.crypto import cifrar
from nfse_core import DpsData, build_dps_xml, sign_dps

dados = DpsData(
    tp_amb=2, dh_emi=datetime.now(timezone.utc), serie='1', numero=1,
    competencia=datetime.now(timezone.utc).date(),
    prest_cnpj='12345678000199', prest_im='123', c_loc_emi='3304557',
    op_simp_nac=3, reg_ap_trib_sn=1,
    toma_cpf_cnpj='11144477735', toma_nome='Paciente Teste', toma_email='paciente@teste.com',
    c_trib_nac='040199', x_desc_serv='Sessao de psicologia', v_serv=__import__('decimal').Decimal('150.00'),
)
xml = build_dps_xml(dados)
assinado = sign_dps(xml, pfx_b64, 'senha123')
print('dps_id:', dados.dps_id)
assert len(dados.dps_id) == 45, 'Id da DPS deveria ter 45 caracteres'
assert b'<Signature' in assinado, 'XML assinado deveria conter o bloco Signature'
print('XML monta e assina OK, tamanho:', len(assinado), 'bytes')
"
```

Expected: `dps_id` com 45 caracteres, `XML monta e assina OK` com o tamanho em bytes.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add nfse-service/app/ && git commit -m "feat: endpoint /emitir no microservico de NFS-e"
```

---

## Task 4: Endpoints `/cancelar` e `/consultar`

**Files:**
- Modify: `nfse-service/app/schemas.py`
- Modify: `nfse-service/app/main.py`

**Interfaces:**
- Consumes: `nfse_core.{EventoCancelamentoData, build_evento_cancelamento_xml, sign_evento, ler_resposta_evento}` (Task 1's kit).
- Produces: `POST /cancelar` (`CancelarResponse`) — consumida pela Task 12 (`cancelarNotaFiscal`). `GET /consultar` — saída de emergência, sem UI nesta v1 (uso manual/suporte).

- [ ] **Step 1: Adicionar os modelos em `app/schemas.py`**

```python
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
```

- [ ] **Step 2: Adicionar os endpoints em `app/main.py`**

```python
from app.schemas import CancelarRequest, CancelarResponse, ConsultarResponse
from nfse_core import EventoCancelamentoData, build_evento_cancelamento_xml, sign_evento, ler_resposta_evento


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
```

- [ ] **Step 3: Verificar a montagem/assinatura do evento de cancelamento localmente**

Mesmo raciocínio da Task 3 Step 3 — isola a parte sob nosso controle (montagem + assinatura), sem depender de rede:

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\nfse-service" && .venv\Scripts\python -c "
import os
os.environ['NFSE_SERVICE_SECRET'] = 'segredo-teste'
os.environ['NFSE_CERT_ENCRYPTION_KEY'] = __import__('cryptography.fernet', fromlist=['Fernet']).Fernet.generate_key().decode()

from datetime import datetime, timedelta, timezone
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID
import base64

chave = rsa.generate_private_key(public_exponent=65537, key_size=2048)
nome = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'EMPRESA TESTE LTDA:12345678000199')])
cert = (
    x509.CertificateBuilder()
    .subject_name(nome).issuer_name(nome).public_key(chave.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(datetime.now(timezone.utc))
    .not_valid_after(datetime.now(timezone.utc) + timedelta(days=365))
    .sign(chave, hashes.SHA256())
)
pfx_bytes = pkcs12.serialize_key_and_certificates(b'teste', chave, cert, None, serialization.BestAvailableEncryption(b'senha123'))
pfx_b64 = base64.b64encode(pfx_bytes).decode()

from nfse_core import EventoCancelamentoData, build_evento_cancelamento_xml, sign_evento

chave_50_digitos = '1' * 50
dados = EventoCancelamentoData(
    chave_nfse=chave_50_digitos, tp_amb=2, dh_evento=datetime.now(timezone.utc),
    autor_cpf_cnpj='12345678000199', x_motivo='Erro na emissao da nota',
)
xml = build_evento_cancelamento_xml(dados)
assinado = sign_evento(xml, pfx_b64, 'senha123')
print('id_ped_reg:', dados.id_ped_reg)
assert dados.id_ped_reg.startswith('PRE' + chave_50_digitos)
assert b'<Signature' in assinado
print('evento de cancelamento monta e assina OK')
"
```

Expected: `id_ped_reg` começando com `PRE` + a chave, `evento de cancelamento monta e assina OK`.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add nfse-service/app/ && git commit -m "feat: endpoints /cancelar e /consultar no microservico de NFS-e"
```

---

## Task 5: Dockerfile do microserviço + guia de deploy

**Files:**
- Create: `nfse-service/Dockerfile`

**Interfaces:**
- Consumes: nenhuma (empacotamento).
- Produces: imagem Docker do serviço, seguindo o mesmo padrão de build-context-na-raiz-do-repo já usado por `web/Dockerfile` (ver memória `psifacil-deploy-infra`).

- [ ] **Step 1: `nfse-service/Dockerfile`**

```dockerfile
FROM python:3.11-slim AS runtime
WORKDIR /app

COPY nfse-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY nfse-service/app ./app
COPY nfse-service/nfse_core ./nfse_core

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Verificar que a imagem builda e sobe localmente**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && docker build -f nfse-service/Dockerfile -t psiagente-nfse-test . && docker run --rm -d -p 8010:8000 -e NFSE_SERVICE_SECRET=teste -e NFSE_CERT_ENCRYPTION_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())") --name psiagente-nfse-test psiagente-nfse-test
sleep 2
curl -s http://localhost:8010/health
docker stop psiagente-nfse-test
```

Expected: `{"status":"ok"}`, container para sem erro.

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add nfse-service/Dockerfile && git commit -m "feat: Dockerfile do microservico de NFS-e"
```

**Nota de infraestrutura (não é passo de código — fazer junto do deploy):** criar o serviço `psiagente-nfse` no EasyPanel (mesmo projeto/namespace `psifacil` que já hospeda o app principal e o Evolution API), apontando o "Arquivo" (Dockerfile path) pra `nfse-service/Dockerfile` com contexto de build na raiz do repo (mesmo padrão do `web/Dockerfile` — ver memória `psifacil-deploy-infra`). Configurar `NFSE_SERVICE_SECRET` e `NFSE_CERT_ENCRYPTION_KEY` nesse serviço, e `NFSE_SERVICE_URL` (apontando pro hostname interno do serviço no EasyPanel, ex: `http://psiagente-nfse:8000`) + `NFSE_SERVICE_SECRET` (mesmo valor) + `RESEND_API_KEY` + `RESEND_FROM_EMAIL` no app principal.

---

## Task 6: Migration — tabelas, RLS, RPC transacional, trigger de irreversibilidade

**Files:**
- Create: `supabase/migrations/20260814000002_add_nfse.sql`

**Interfaces:**
- Produces: tabelas `DadosFiscaisProfissional` e `NotaFiscal`, função `public.registrar_nota_fiscal_pendente(p_pagamento_sessao bigint)` — consumida pela Task 11.

- [ ] **Step 1: Escrever a migration**

```sql
-- Dados fiscais do profissional (emitente da NFS-e) — 1 por profissional.
create table "DadosFiscaisProfissional" (
  id bigint generated by default as identity primary key,
  owner uuid not null unique default auth.uid() references auth.users(id),

  tipo_documento text not null check (tipo_documento in ('cpf', 'cnpj')),
  documento text not null,
  inscricao_municipal text,
  nome_empresarial text not null,
  email_nfse text not null,
  telefone_nfse text,
  logradouro text not null,
  numero text not null,
  complemento text,
  bairro text not null,
  municipio_ibge text not null,
  uf text not null,
  cep text not null,

  optante_simples_nacional int not null default 3
    check (optante_simples_nacional in (1, 2, 3)),
  regime_apuracao_sn int,

  codigo_tributacao_nacional text not null,

  certificado_pfx_cifrado text,
  certificado_senha_cifrada text,
  certificado_titular text,
  certificado_validade date,

  ambiente text not null default 'homologacao' check (ambiente in ('homologacao', 'producao')),
  serie text not null default '1',
  proximo_numero int not null default 1,

  created_at timestamptz not null default now()
);

-- Registro de cada emissao. pagamento_sessao (nao sessao/paciente direto):
-- o valor fiscal correto e o que foi de fato recebido (PagamentoSessao),
-- mesma fonte que o item 8 (Carne-Leao) ja usa -- ver spec.
create table "NotaFiscal" (
  id bigint generated by default as identity primary key,
  owner uuid not null default auth.uid() references auth.users(id),
  pagamento_sessao bigint not null unique references "PagamentoSessao"(id),

  status text not null default 'pendente'
    check (status in ('pendente', 'autorizada', 'rejeitada', 'cancelada')),
  ambiente text not null,
  numero int not null,
  serie text not null,
  dps_id text,
  chave_acesso text,
  xml_dps text,
  xml_nfse text,
  erros jsonb,

  created_at timestamptz not null default now()
);

alter table "DadosFiscaisProfissional" enable row level security;
alter table "NotaFiscal" enable row level security;

create policy "dadosfiscaisprofissional_select_own" on "DadosFiscaisProfissional"
  for select using (owner = auth.uid() or public.is_admin());
create policy "dadosfiscaisprofissional_insert_own" on "DadosFiscaisProfissional"
  for insert with check (owner = auth.uid());
create policy "dadosfiscaisprofissional_update_own" on "DadosFiscaisProfissional"
  for update using (owner = auth.uid() or public.is_admin()) with check (owner = auth.uid() or public.is_admin());
create policy "dadosfiscaisprofissional_delete_own" on "DadosFiscaisProfissional"
  for delete using (owner = auth.uid() or public.is_admin());

create policy "notafiscal_select_own" on "NotaFiscal"
  for select using (owner = auth.uid() or public.is_admin());
create policy "notafiscal_insert_own" on "NotaFiscal"
  for insert with check (owner = auth.uid());
create policy "notafiscal_update_own" on "NotaFiscal"
  for update using (owner = auth.uid() or public.is_admin()) with check (owner = auth.uid() or public.is_admin());
create policy "notafiscal_delete_own" on "NotaFiscal"
  for delete using (owner = auth.uid() or public.is_admin());

-- Trava a troca de ambiente: uma vez em producao, nunca mais volta pra
-- homologacao. Defesa em profundidade -- a Server Action ja evita isso,
-- mas o banco garante mesmo se algum caminho de codigo futuro esquecer.
create or replace function public.impedir_reversao_ambiente_nfse()
returns trigger
language plpgsql
as $$
begin
  if old.ambiente = 'producao' and new.ambiente <> 'producao' then
    raise exception 'Nao e possivel voltar de producao para homologacao.';
  end if;
  return new;
end;
$$;

create trigger trg_impedir_reversao_ambiente_nfse
  before update on "DadosFiscaisProfissional"
  for each row
  execute function public.impedir_reversao_ambiente_nfse();

-- Numeracao transacional: consome o proximo numero E grava a NotaFiscal
-- pendente na MESMA operacao (UPDATE...RETURNING trava a linha do
-- profissional, serializando emissoes concorrentes -- nunca um SELECT
-- seguido de UPDATE separado, que e o caminho da duplicata).
create or replace function public.registrar_nota_fiscal_pendente(p_pagamento_sessao bigint)
returns table (id bigint, numero int, serie text, ambiente text)
language plpgsql
as $$
declare
  v_numero int;
  v_serie text;
  v_ambiente text;
  v_id bigint;
begin
  update "DadosFiscaisProfissional" df
     set proximo_numero = df.proximo_numero + 1
   where df.owner = auth.uid()
  returning df.proximo_numero - 1, df.serie, df.ambiente into v_numero, v_serie, v_ambiente;

  if v_numero is null then
    raise exception 'Dados fiscais nao configurados para este profissional';
  end if;

  insert into "NotaFiscal" (owner, pagamento_sessao, status, ambiente, numero, serie)
  values (auth.uid(), p_pagamento_sessao, 'pendente', v_ambiente, v_numero, v_serie)
  returning "NotaFiscal".id into v_id;

  return query select v_id, v_numero, v_serie, v_ambiente;
end;
$$;
```

- [ ] **Step 2: Aplicar a migration no banco de produção**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('../supabase/migrations/20260814000002_add_nfse.sql', 'utf8');
const client = new Client({
  connectionString: 'postgresql://postgres:' + encodeURIComponent(process.env.SUPABASE_DB_PASSWORD) + '@db.rohulajgyxdangxfurha.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  await client.query(sql);
  console.log('migration aplicada');
  await client.end();
}).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: `migration aplicada` sem erro.

- [ ] **Step 3: Verificar RLS, trigger e RPC com dados descartáveis**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const email = 'teste-nfse-' + Date.now() + '@example.com';
  const { data: authData } = await admin.auth.admin.createUser({ email, password: 'SenhaTeste123', email_confirm: true });
  const idUser = authData.user.id;
  await admin.from('Usuarios').insert({ id_user: idUser, email, nome: 'Teste NFSe', role: 'psicologo', aprovado: true, plano: 'gestao_marketing', contato: '11999999999' });

  const { data: fiscal, error: eFiscal } = await admin.from('DadosFiscaisProfissional').insert({
    owner: idUser, tipo_documento: 'cpf', documento: '11144477735', nome_empresarial: 'Teste NFSe',
    email_nfse: email, logradouro: 'Rua Teste', numero: '1', bairro: 'Centro', municipio_ibge: '3304557',
    uf: 'RJ', cep: '20000000', codigo_tributacao_nacional: '040199',
  }).select('id, proximo_numero, ambiente').single();
  console.log('dados fiscais criados:', fiscal, eFiscal?.message || '');

  // trigger: producao -> homologacao deve falhar
  await admin.from('DadosFiscaisProfissional').update({ ambiente: 'producao' }).eq('owner', idUser);
  const { error: eReversao } = await admin.from('DadosFiscaisProfissional').update({ ambiente: 'homologacao' }).eq('owner', idUser);
  console.log('reversao producao->homologacao (esperado erro):', eReversao?.message || 'SEM ERRO (bug)');

  // RPC (via client authenticated como o usuario de teste, pra respeitar RLS/auth.uid())
  const anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
  const asUser = createClient(url, anonKey);
  await asUser.auth.signInWithPassword({ email, password: 'SenhaTeste123' });

  const { data: consultorioDummy } = await admin.from('Consultorio').insert({ nome: 'C Teste NFSe', owner: idUser }).select('id').single();
  const { data: pacienteDummy } = await admin.from('Paciente').insert({ nome: 'Paciente NFSe', documento: 'nota_fiscal', consultorio: consultorioDummy.id, valor_sessao: 150, owner: idUser, cpf: '11122233396', email: 'paciente-nfse@example.com' }).select('id').single();
  const { data: sessaoDummy } = await admin.from('Sessao').insert({ paciente: pacienteDummy.id, data: new Date().toISOString().slice(0,10), horario: '10:00', owner: idUser, Realizado: true }).select('id').single();
  const { data: pagamentoDummy } = await admin.from('PagamentoSessao').insert({ sessao: sessaoDummy.id, valor: 150, data_pagamento: new Date().toISOString().slice(0,10) }).select('id').single();

  const { data: registro, error: eRpc } = await asUser.rpc('registrar_nota_fiscal_pendente', { p_pagamento_sessao: pagamentoDummy.id });
  console.log('RPC registrar_nota_fiscal_pendente:', registro, eRpc?.message || '');

  const { data: numeroDepois } = await admin.from('DadosFiscaisProfissional').select('proximo_numero').eq('owner', idUser).single();
  console.log('proximo_numero avancou (esperado 2):', numeroDepois.proximo_numero);

  const { data: notaCriada } = await admin.from('NotaFiscal').select('*').eq('pagamento_sessao', pagamentoDummy.id).single();
  console.log('NotaFiscal pendente criada:', notaCriada.status, notaCriada.numero, notaCriada.serie);

  // cleanup
  await admin.from('NotaFiscal').delete().eq('owner', idUser);
  await admin.from('PagamentoSessao').delete().eq('id', pagamentoDummy.id);
  await admin.from('Sessao').delete().eq('id', sessaoDummy.id);
  await admin.from('Paciente').delete().eq('id', pacienteDummy.id);
  await admin.from('Consultorio').delete().eq('id', consultorioDummy.id);
  await admin.from('DadosFiscaisProfissional').delete().eq('owner', idUser);
  await admin.from('Usuarios').delete().eq('id_user', idUser);
  await admin.auth.admin.deleteUser(idUser);
  console.log('cleanup concluido');
})();
"
```

Expected: dados fiscais criados com `proximo_numero: 1`; reversão produção→homologação retorna erro (não `SEM ERRO (bug)`); RPC devolve `[{id, numero: 1, serie: '1', ambiente: 'producao'}]`; `proximo_numero` avança pra `2`; `NotaFiscal` criada com `status: 'pendente'`; cleanup sem erro.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add supabase/migrations/20260814000002_add_nfse.sql && git commit -m "feat: tabelas, RLS, RPC transacional e trigger de irreversibilidade pra NFS-e"
```

---

## Task 7: Cliente HTTP do microserviço + helper de e-mail (Resend)

**Files:**
- Create: `web/lib/nfse-client.js`
- Create: `web/lib/email.js`

**Interfaces:**
- Produces: `chamarServicoNfse(caminho: string, corpo: object) -> Promise<object>` — consumida pelas Tasks 9, 11 e 12. `sendEmail({to, subject, html, attachments}) -> Promise<object>` e `enviarEmailNotaFiscal({paraEmail, pacienteNome, xmlBase64, pdfBase64}) -> Promise<object>` — consumida pela Task 12.

- [ ] **Step 1: `web/lib/nfse-client.js`**

```js
// Ponte com o microservico Python de NFS-e -- ver
// docs/superpowers/specs/2026-08-14-nfse-emissao-design.md. Nunca lida com
// o certificado em texto puro: so repassa os blobs ja cifrados que o
// microservico devolveu no upload.
export async function chamarServicoNfse(caminho, corpo) {
  const url = process.env.NFSE_SERVICE_URL;
  const segredo = process.env.NFSE_SERVICE_SECRET;
  if (!url || !segredo) {
    throw new Error("Servico de NFS-e nao configurado (NFSE_SERVICE_URL/NFSE_SERVICE_SECRET ausentes).");
  }

  const resposta = await fetch(`${url}${caminho}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Nfse-Secret": segredo,
    },
    body: JSON.stringify(corpo),
  });

  const dados = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    throw new Error(dados?.detail || `Servico de NFS-e respondeu ${resposta.status}.`);
  }

  return dados;
}
```

- [ ] **Step 2: `web/lib/email.js`**

```js
// Primeira integracao de e-mail direta neste app (o item 9 usa um n8n
// externo, que nem esta implantado -- ver correcao na spec deste item).
const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendEmail({ to, subject, html, attachments = [] }) {
  const apiKey = process.env.RESEND_API_KEY;
  const remetente = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !remetente) {
    throw new Error("Resend nao configurado (RESEND_API_KEY/RESEND_FROM_EMAIL ausentes).");
  }

  const resposta = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: remetente, to, subject, html, attachments }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`Falha ao enviar e-mail via Resend (${resposta.status}): ${corpo}`);
  }

  return resposta.json();
}

export async function enviarEmailNotaFiscal({ paraEmail, pacienteNome, xmlBase64, pdfBase64 }) {
  const anexos = [{ filename: "nota-fiscal.xml", content: xmlBase64 }];
  if (pdfBase64) {
    anexos.push({ filename: "nota-fiscal.pdf", content: pdfBase64 });
  }

  return sendEmail({
    to: paraEmail,
    subject: "Sua Nota Fiscal de Servico (NFS-e)",
    html: `<p>Ola, ${pacienteNome}.</p><p>Segue em anexo a Nota Fiscal de Servico referente ao seu atendimento.</p>`,
    attachments: anexos,
  });
}
```

- [ ] **Step 3: Verificar `chamarServicoNfse` contra o microserviço rodando localmente**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\nfse-service" && (NFSE_SERVICE_SECRET=segredo-teste NFSE_CERT_ENCRYPTION_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())") .venv\Scripts\uvicorn app.main:app --port 8020 > "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\0139c12f-3608-40f4-b2a2-565f62e48873\scratchpad\nfse-service.log" 2>&1 &)
sleep 2
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && NFSE_SERVICE_URL=http://localhost:8020 NFSE_SERVICE_SECRET=segredo-teste node -e "
const { chamarServicoNfse } = require('./lib/nfse-client.js');
"
```

Este projeto usa ES modules (`import`) no código de app — pra testar um helper isolado via `node -e` sem subir o Next inteiro, criar um script `.mjs` temporário em vez de `require`:

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && cat > _verificar-nfse-client.mjs << 'EOF'
process.env.NFSE_SERVICE_URL = "http://localhost:8020";
process.env.NFSE_SERVICE_SECRET = "segredo-teste";
const { chamarServicoNfse } = await import("./lib/nfse-client.js");

try {
  await chamarServicoNfse("/certificado/validar", { pfx_base64: "invalido", senha: "x" });
  console.log("FALHA: deveria ter lancado erro");
} catch (erro) {
  console.log("erro esperado (pfx invalido):", erro.message);
}
EOF
node _verificar-nfse-client.mjs
rm _verificar-nfse-client.mjs
```

Expected: `erro esperado (pfx invalido): ...` (a mensagem vem do `detail` que o FastAPI devolveu). Depois, parar o microserviço:

```bash
netstat -ano | grep ":8020" | grep LISTENING
```

(anotar o PID e `powershell -Command "Stop-Process -Id <PID> -Force"`, mesmo padrão já usado nesta sessão pra parar servidores de teste).

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/nfse-client.js web/lib/email.js && git commit -m "feat: cliente HTTP do microservico de NFS-e e helper de e-mail via Resend"
```

---

## Task 8: Dados fiscais — data layer, server action, formulário, tela

**Files:**
- Create: `web/lib/data/dados-fiscais.js`
- Create: `web/lib/actions/dados-fiscais.js`
- Create: `web/components/DadosFiscaisForm.js`
- Create: `web/app/(app)/(gestao)/configuracoes/nfse/page.js`
- Modify: `web/components/SidebarNav.js`
- Modify: `web/components/icons/NavIcons.js`

**Interfaces:**
- Produces: `buscarDadosFiscais() -> Promise<object|null>`, `salvarDadosFiscais(prevState, formData) -> {error}|{sucesso}` — a Task 9 e 10 adicionam mais actions no mesmo arquivo/tela.

- [ ] **Step 1: `web/lib/data/dados-fiscais.js`**

```js
import { createClient } from "@/lib/supabase/server";
import { normalizarIds } from "@/lib/normalizar-ids";

export async function buscarDadosFiscais() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("DadosFiscaisProfissional")
    .select("*")
    .eq("owner", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? normalizarIds(data, ["id"]) : null;
}
```

- [ ] **Step 2: `web/lib/actions/dados-fiscais.js`**

```js
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function dadosDoFormulario(formData) {
  return {
    tipo_documento: formData.get("tipo_documento"),
    documento: formData.get("documento"),
    inscricao_municipal: formData.get("inscricao_municipal") || null,
    nome_empresarial: formData.get("nome_empresarial"),
    email_nfse: formData.get("email_nfse"),
    telefone_nfse: formData.get("telefone_nfse") || null,
    logradouro: formData.get("logradouro"),
    numero: formData.get("numero"),
    complemento: formData.get("complemento") || null,
    bairro: formData.get("bairro"),
    municipio_ibge: formData.get("municipio_ibge"),
    uf: formData.get("uf"),
    cep: formData.get("cep"),
    optante_simples_nacional: Number(formData.get("optante_simples_nacional")),
    regime_apuracao_sn: formData.get("regime_apuracao_sn") ? Number(formData.get("regime_apuracao_sn")) : null,
    codigo_tributacao_nacional: formData.get("codigo_tributacao_nacional"),
  };
}

export async function salvarDadosFiscais(prevState, formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autorizado." };

  const dados = dadosDoFormulario(formData);

  const { error } = await supabase
    .from("DadosFiscaisProfissional")
    .upsert({ owner: user.id, ...dados }, { onConflict: "owner" });

  if (error) return { error: "Não foi possível salvar os dados fiscais: " + error.message };

  revalidatePath("/configuracoes/nfse");
  return { sucesso: true };
}
```

- [ ] **Step 3: `web/components/DadosFiscaisForm.js`**

```jsx
"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function DadosFiscaisForm({ action, dadosFiscais }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-lg space-y-4 card p-6">
      <h2 className="text-lg font-bold text-navy">Dados de Emissão</h2>

      <div>
        <label htmlFor="tipo_documento" className="block text-sm font-semibold text-navy">
          Tipo de documento
        </label>
        <select
          id="tipo_documento"
          name="tipo_documento"
          required
          defaultValue={dadosFiscais?.tipo_documento ?? "cpf"}
          className="field"
        >
          <option value="cpf">CPF (autônomo)</option>
          <option value="cnpj">CNPJ (empresa)</option>
        </select>
      </div>

      <div>
        <label htmlFor="documento" className="block text-sm font-semibold text-navy">
          CPF/CNPJ do emitente
        </label>
        <input id="documento" name="documento" type="text" required defaultValue={dadosFiscais?.documento ?? ""} className="field" />
      </div>

      <div>
        <label htmlFor="inscricao_municipal" className="block text-sm font-semibold text-navy">
          Inscrição Municipal
        </label>
        <input
          id="inscricao_municipal"
          name="inscricao_municipal"
          type="text"
          defaultValue={dadosFiscais?.inscricao_municipal ?? ""}
          className="field"
        />
        <p className="text-xs text-muted mt-1">Obrigatória na maioria dos municípios.</p>
      </div>

      <div>
        <label htmlFor="nome_empresarial" className="block text-sm font-semibold text-navy">
          Nome / Nome Empresarial
        </label>
        <input
          id="nome_empresarial"
          name="nome_empresarial"
          type="text"
          required
          defaultValue={dadosFiscais?.nome_empresarial ?? ""}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="email_nfse" className="block text-sm font-semibold text-navy">
          E-mail
        </label>
        <input id="email_nfse" name="email_nfse" type="email" required defaultValue={dadosFiscais?.email_nfse ?? ""} className="field" />
      </div>

      <div>
        <label htmlFor="telefone_nfse" className="block text-sm font-semibold text-navy">
          Telefone
        </label>
        <input id="telefone_nfse" name="telefone_nfse" type="text" defaultValue={dadosFiscais?.telefone_nfse ?? ""} className="field" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label htmlFor="logradouro" className="block text-sm font-semibold text-navy">
            Endereço
          </label>
          <input id="logradouro" name="logradouro" type="text" required defaultValue={dadosFiscais?.logradouro ?? ""} className="field" />
        </div>
        <div>
          <label htmlFor="numero" className="block text-sm font-semibold text-navy">
            Número
          </label>
          <input id="numero" name="numero" type="text" required defaultValue={dadosFiscais?.numero ?? ""} className="field" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="complemento" className="block text-sm font-semibold text-navy">
            Complemento
          </label>
          <input id="complemento" name="complemento" type="text" defaultValue={dadosFiscais?.complemento ?? ""} className="field" />
        </div>
        <div>
          <label htmlFor="bairro" className="block text-sm font-semibold text-navy">
            Bairro
          </label>
          <input id="bairro" name="bairro" type="text" required defaultValue={dadosFiscais?.bairro ?? ""} className="field" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="municipio_ibge" className="block text-sm font-semibold text-navy">
            Código IBGE do município
          </label>
          <input
            id="municipio_ibge"
            name="municipio_ibge"
            type="text"
            required
            pattern="\d{7}"
            title="7 dígitos"
            defaultValue={dadosFiscais?.municipio_ibge ?? ""}
            className="field"
          />
          <p className="text-xs text-muted mt-1">
            Consulte em{" "}
            <a href="https://www.ibge.gov.br/explica/codigos-dos-municipios.php" target="_blank" rel="noreferrer" className="underline">
              ibge.gov.br
            </a>
            .
          </p>
        </div>
        <div>
          <label htmlFor="uf" className="block text-sm font-semibold text-navy">
            UF
          </label>
          <input id="uf" name="uf" type="text" required maxLength={2} defaultValue={dadosFiscais?.uf ?? ""} className="field" />
        </div>
        <div>
          <label htmlFor="cep" className="block text-sm font-semibold text-navy">
            CEP
          </label>
          <input id="cep" name="cep" type="text" required defaultValue={dadosFiscais?.cep ?? ""} className="field" />
        </div>
      </div>

      <fieldset className="space-y-3 border-t border-border pt-4">
        <legend className="text-sm font-semibold text-navy px-0">Regime tributário</legend>
        <div>
          <label htmlFor="optante_simples_nacional" className="block text-sm font-semibold text-navy">
            Simples Nacional
          </label>
          <select
            id="optante_simples_nacional"
            name="optante_simples_nacional"
            required
            defaultValue={dadosFiscais?.optante_simples_nacional ?? 3}
            className="field"
          >
            <option value={1}>Não optante</option>
            <option value={2}>Optante MEI</option>
            <option value={3}>Optante ME/EPP</option>
          </select>
        </div>
        <div>
          <label htmlFor="regime_apuracao_sn" className="block text-sm font-semibold text-navy">
            Regime de apuração (Simples Nacional)
          </label>
          <input
            id="regime_apuracao_sn"
            name="regime_apuracao_sn"
            type="number"
            defaultValue={dadosFiscais?.regime_apuracao_sn ?? ""}
            className="field"
          />
          <p className="text-xs text-muted mt-1">
            Obrigatório quando optante ME/EPP — confira o código exato no manual da NFS-e Nacional antes da primeira
            emissão.
          </p>
        </div>
      </fieldset>

      <div>
        <label htmlFor="codigo_tributacao_nacional" className="block text-sm font-semibold text-navy">
          Código de Tributação Nacional (LC 116)
        </label>
        <input
          id="codigo_tributacao_nacional"
          name="codigo_tributacao_nacional"
          type="text"
          required
          defaultValue={dadosFiscais?.codigo_tributacao_nacional ?? ""}
          className="field"
        />
        <p className="text-xs text-muted mt-1">Confirme o código certo com seu contador antes de emitir a primeira nota.</p>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.sucesso && <p className="text-sm text-green-700">Dados fiscais salvos.</p>}

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Salvando..." : "Salvar dados fiscais"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: `web/app/(app)/(gestao)/configuracoes/nfse/page.js`** (versão inicial — as Tasks 9 e 10 acrescentam os outros blocos)

```jsx
import DadosFiscaisForm from "@/components/DadosFiscaisForm";
import { salvarDadosFiscais } from "@/lib/actions/dados-fiscais";
import { buscarDadosFiscais } from "@/lib/data/dados-fiscais";

export default async function PaginaNfseConfig() {
  const dadosFiscais = await buscarDadosFiscais();

  return (
    <div className="space-y-6">
      <h1 className="page-title">Dados de Emissão de NFS-e</h1>
      <DadosFiscaisForm action={salvarDadosFiscais} dadosFiscais={dadosFiscais} />
    </div>
  );
}
```

- [ ] **Step 5: Adicionar o item de menu**

Em `web/components/icons/NavIcons.js`, adicionar (junto dos outros ícones):

```jsx
export function IconeNotaFiscal(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3h6l3 3v11H6z" />
      <path d="M12 3v3h3" />
      <path d="M8.5 12.5 12.5 8.5M9 8.5h.01M12 12.5h.01" />
    </svg>
  );
}
```

Em `web/components/SidebarNav.js`: importar `IconeNotaFiscal` junto dos outros ícones (linha do `import { ... } from "@/components/icons/NavIcons"`), e adicionar no array `ITENS_NAV`, logo depois do item `/configuracoes/whatsapp` (mesmo padrão de `/configuracoes/conta` e `/configuracoes/whatsapp`, que já têm item próprio):

```js
{ href: "/configuracoes/nfse", label: "NFS-e", Icone: IconeNotaFiscal },
```

- [ ] **Step 6: Verificar o CRUD de dados fiscais com dados descartáveis**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const email = 'teste-dados-fiscais-' + Date.now() + '@example.com';
  const { data: authData } = await admin.auth.admin.createUser({ email, password: 'SenhaTeste123', email_confirm: true });
  const idUser = authData.user.id;
  await admin.from('Usuarios').insert({ id_user: idUser, email, nome: 'Teste', role: 'psicologo', aprovado: true, plano: 'gestao_marketing', contato: '11999999999' });

  // simula o upsert que salvarDadosFiscais faz
  const { error: eUpsert } = await admin.from('DadosFiscaisProfissional').upsert({
    owner: idUser, tipo_documento: 'cpf', documento: '11144477735', nome_empresarial: 'Teste',
    email_nfse: email, logradouro: 'Rua X', numero: '1', bairro: 'Centro', municipio_ibge: '3304557',
    uf: 'RJ', cep: '20000000', optante_simples_nacional: 3, regime_apuracao_sn: 1, codigo_tributacao_nacional: '040199',
  }, { onConflict: 'owner' });
  console.log('upsert 1:', eUpsert?.message || 'ok');

  // upsert de novo (edicao) -- confirma que atualiza em vez de duplicar
  await admin.from('DadosFiscaisProfissional').upsert({ owner: idUser, nome_empresarial: 'Teste Editado' }, { onConflict: 'owner' });
  const { data: linhas } = await admin.from('DadosFiscaisProfissional').select('id, nome_empresarial').eq('owner', idUser);
  console.log('linhas apos 2 upserts (esperado 1, nome editado):', linhas.length, linhas[0]?.nome_empresarial);

  await admin.from('DadosFiscaisProfissional').delete().eq('owner', idUser);
  await admin.from('Usuarios').delete().eq('id_user', idUser);
  await admin.auth.admin.deleteUser(idUser);
  console.log('cleanup ok');
})();
"
```

Expected: `upsert 1: ok`, `linhas apos 2 upserts (esperado 1, nome editado): 1 Teste Editado`, `cleanup ok`.

- [ ] **Step 7: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/data/dados-fiscais.js web/lib/actions/dados-fiscais.js web/components/DadosFiscaisForm.js "web/app/(app)/(gestao)/configuracoes/nfse" web/components/SidebarNav.js web/components/icons/NavIcons.js && git commit -m "feat: tela de dados fiscais para emissao de NFS-e (/configuracoes/nfse)"
```

---

## Task 9: Upload e validação do certificado digital

**Files:**
- Modify: `web/lib/actions/dados-fiscais.js`
- Create: `web/components/CertificadoForm.js`
- Modify: `web/app/(app)/(gestao)/configuracoes/nfse/page.js`

**Interfaces:**
- Consumes: `chamarServicoNfse` (Task 7), `buscarDadosFiscais` (Task 8).
- Produces: `enviarCertificado(prevState, formData) -> {error}|{sucesso, avisoTitularidade}`.

- [ ] **Step 1: Adicionar a action em `web/lib/actions/dados-fiscais.js`**

```js
import { chamarServicoNfse } from "@/lib/nfse-client";

export async function enviarCertificado(prevState, formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autorizado." };

  const arquivo = formData.get("certificado");
  const senha = formData.get("senha_certificado");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { error: "Selecione o arquivo .pfx do certificado." };
  }

  const { data: fiscal } = await supabase
    .from("DadosFiscaisProfissional")
    .select("documento")
    .eq("owner", user.id)
    .maybeSingle();

  if (!fiscal) {
    return { error: "Preencha e salve os dados fiscais antes de enviar o certificado." };
  }

  const pfxBase64 = Buffer.from(await arquivo.arrayBuffer()).toString("base64");

  let resultado;
  try {
    resultado = await chamarServicoNfse("/certificado/validar", {
      pfx_base64: pfxBase64,
      senha,
      documento_esperado: fiscal.documento,
    });
  } catch (erro) {
    return { error: erro.message };
  }

  const { error } = await supabase
    .from("DadosFiscaisProfissional")
    .update({
      certificado_pfx_cifrado: resultado.pfx_cifrado,
      certificado_senha_cifrada: resultado.senha_cifrada,
      certificado_titular: resultado.titular,
      certificado_validade: resultado.valido_ate,
    })
    .eq("owner", user.id);

  if (error) return { error: "Certificado validado, mas não foi possível salvar: " + error.message };

  revalidatePath("/configuracoes/nfse");
  return { sucesso: true, avisoTitularidade: resultado.alerta_titularidade };
}
```

(o `import { chamarServicoNfse } ...` vai no topo do arquivo, junto dos outros imports já existentes)

- [ ] **Step 2: `web/components/CertificadoForm.js`**

```jsx
"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function CertificadoForm({ action, dadosFiscais }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-lg space-y-4 card p-6">
      <h2 className="text-lg font-bold text-navy">Certificado digital (A1)</h2>

      {dadosFiscais?.certificado_titular && (
        <p className="text-sm text-muted">
          Certificado atual: <strong>{dadosFiscais.certificado_titular}</strong>
          {dadosFiscais.certificado_validade && <> — válido até {dadosFiscais.certificado_validade}</>}
        </p>
      )}

      <div>
        <label htmlFor="certificado" className="block text-sm font-semibold text-navy">
          Arquivo .pfx
        </label>
        <input id="certificado" name="certificado" type="file" accept=".pfx" required className="field" />
      </div>

      <div>
        <label htmlFor="senha_certificado" className="block text-sm font-semibold text-navy">
          Senha do certificado
        </label>
        <input id="senha_certificado" name="senha_certificado" type="password" required className="field" />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.sucesso && (
        <p className="text-sm text-green-700">
          Certificado validado e salvo.
          {state.avisoTitularidade && <span className="block text-yellow-700 mt-1">{state.avisoTitularidade}</span>}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Enviando..." : "Enviar certificado"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Atualizar a tela**

Em `web/app/(app)/(gestao)/configuracoes/nfse/page.js`:

```jsx
import DadosFiscaisForm from "@/components/DadosFiscaisForm";
import CertificadoForm from "@/components/CertificadoForm";
import { salvarDadosFiscais, enviarCertificado } from "@/lib/actions/dados-fiscais";
import { buscarDadosFiscais } from "@/lib/data/dados-fiscais";

export default async function PaginaNfseConfig() {
  const dadosFiscais = await buscarDadosFiscais();

  return (
    <div className="space-y-6">
      <h1 className="page-title">Dados de Emissão de NFS-e</h1>

      {dadosFiscais?.certificado_validade &&
        new Date(dadosFiscais.certificado_validade) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) && (
          <p className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
            Certificado digital vence em {dadosFiscais.certificado_validade} — providencie a renovação.
          </p>
        )}

      <DadosFiscaisForm action={salvarDadosFiscais} dadosFiscais={dadosFiscais} />
      <CertificadoForm action={enviarCertificado} dadosFiscais={dadosFiscais} />
    </div>
  );
}
```

- [ ] **Step 4: Verificar o corpo size limit de Server Actions pro upload**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && grep -n "bodySizeLimit\|serverActions" next.config.mjs || echo "sem limite customizado -- default do Next e 1MB, suficiente pra um .pfx (poucos KB)"
```

Se o certificado real de algum profissional for maior que 1MB (incomum, mas possível com cadeia de certificação grande), adicionar em `next.config.mjs`:

```js
const nextConfig = {
  output: "standalone",
  turbopack: { root: __dirname },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};
```

Não aplicar essa mudança agora — só documentado aqui pra caso o Step 5 (verificação com o microserviço local) encontre erro de tamanho.

- [ ] **Step 5: Verificar o fluxo completo (upload -> validação -> cifra -> grava) com o microserviço rodando localmente**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\nfse-service" && (NFSE_SERVICE_SECRET=segredo-teste NFSE_CERT_ENCRYPTION_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())") .venv\Scripts\uvicorn app.main:app --port 8020 > "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\0139c12f-3608-40f4-b2a2-565f62e48873\scratchpad\nfse-service.log" 2>&1 &)
sleep 2
```

Depois, gerar um `.pfx` sintético de teste (mesma técnica das Tasks 2/3) e salvar em disco, subir o app Next (build+preview, mesmo padrão já usado nesta sessão pra evitar o dev server), logar com um usuário de teste, ir em `/configuracoes/nfse`, salvar os dados fiscais e enviar o certificado pela UI — confirmar que "Certificado validado e salvo" aparece e que `DadosFiscaisProfissional.certificado_pfx_cifrado` foi preenchido no banco (consulta direta via service role). Ao final, parar o microserviço e limpar o usuário/certificado de teste — mesmo processo de verificação via Playwright + dados descartáveis já usado nas sessões anteriores deste projeto (login, preencher formulário, `page.setInputFiles` pro campo de arquivo).

- [ ] **Step 6: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/actions/dados-fiscais.js web/components/CertificadoForm.js "web/app/(app)/(gestao)/configuracoes/nfse/page.js" && git commit -m "feat: upload e validacao do certificado digital A1 na tela de NFS-e"
```

---

## Task 10: Troca de ambiente homologação → produção (irreversível)

**Files:**
- Modify: `web/lib/actions/dados-fiscais.js`
- Create: `web/components/AmbienteNfseForm.js`
- Modify: `web/app/(app)/(gestao)/configuracoes/nfse/page.js`

**Interfaces:**
- Consumes: trigger `impedir_reversao_ambiente_nfse` (Task 6) como rede de segurança.
- Produces: `trocarParaProducao(prevState, formData) -> {error}|{sucesso}`.

- [ ] **Step 1: Adicionar a action em `web/lib/actions/dados-fiscais.js`**

```js
export async function trocarParaProducao(prevState, formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autorizado." };

  const { error } = await supabase
    .from("DadosFiscaisProfissional")
    .update({ ambiente: "producao" })
    .eq("owner", user.id)
    .eq("ambiente", "homologacao");

  if (error) return { error: "Não foi possível trocar de ambiente: " + error.message };

  revalidatePath("/configuracoes/nfse");
  return { sucesso: true };
}
```

- [ ] **Step 2: `web/components/AmbienteNfseForm.js`**

```jsx
"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function AmbienteNfseForm({ action, ambiente }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  function confirmarAntes(event) {
    if (
      !window.confirm(
        "Trocar para PRODUÇÃO faz as próximas notas serem documentos fiscais REAIS. Essa troca não pode ser desfeita. Confirma?"
      )
    ) {
      event.preventDefault();
    }
  }

  if (ambiente === "producao") {
    return (
      <div className="card p-6">
        <p className="text-sm font-semibold text-navy">Ambiente: Produção</p>
        <p className="text-xs text-muted mt-1">As notas emitidas a partir de agora são documentos fiscais reais.</p>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={confirmarAntes} className="card p-6 space-y-3">
      <p className="text-sm font-semibold text-navy">Ambiente: Homologação (teste)</p>
      <p className="text-xs text-muted">
        Notas emitidas em homologação não são documentos fiscais reais. Troque para produção só quando tiver
        confirmado que a emissão de teste funcionou.
      </p>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-outline">
        {pending ? "Trocando..." : "Trocar para Produção (irreversível)"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Atualizar a tela**

Em `web/app/(app)/(gestao)/configuracoes/nfse/page.js`, adicionar o import e o componente:

```jsx
import AmbienteNfseForm from "@/components/AmbienteNfseForm";
import { salvarDadosFiscais, enviarCertificado, trocarParaProducao } from "@/lib/actions/dados-fiscais";
```

E, depois de `<CertificadoForm ... />`:

```jsx
{dadosFiscais && <AmbienteNfseForm action={trocarParaProducao} ambiente={dadosFiscais.ambiente} />}
```

- [ ] **Step 4: Verificar com dados descartáveis (a action + o trigger juntos)**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const email = 'teste-ambiente-nfse-' + Date.now() + '@example.com';
  const { data: authData } = await admin.auth.admin.createUser({ email, password: 'SenhaTeste123', email_confirm: true });
  const idUser = authData.user.id;
  await admin.from('Usuarios').insert({ id_user: idUser, email, nome: 'Teste', role: 'psicologo', aprovado: true, plano: 'gestao_marketing', contato: '11999999999' });
  await admin.from('DadosFiscaisProfissional').insert({
    owner: idUser, tipo_documento: 'cpf', documento: '11144477735', nome_empresarial: 'Teste',
    email_nfse: email, logradouro: 'Rua X', numero: '1', bairro: 'Centro', municipio_ibge: '3304557',
    uf: 'RJ', cep: '20000000', codigo_tributacao_nacional: '040199',
  });

  // simula trocarParaProducao (condicao homologacao -> producao)
  const { error: e1, count } = await admin.from('DadosFiscaisProfissional').update({ ambiente: 'producao' }).eq('owner', idUser).eq('ambiente', 'homologacao').select('*', { count: 'exact' });
  console.log('troca homologacao->producao:', e1?.message || 'ok', 'linhas afetadas:', count);

  const { data: depois } = await admin.from('DadosFiscaisProfissional').select('ambiente').eq('owner', idUser).single();
  console.log('ambiente apos troca (esperado producao):', depois.ambiente);

  // segunda tentativa de trocar pra producao (idempotente -- condicao ambiente=homologacao nao bate mais, 0 linhas, sem erro)
  const { error: e2, count: count2 } = await admin.from('DadosFiscaisProfissional').update({ ambiente: 'producao' }).eq('owner', idUser).eq('ambiente', 'homologacao').select('*', { count: 'exact' });
  console.log('segunda tentativa (esperado 0 linhas, sem erro):', e2?.message || 'ok', count2);

  // tentativa direta de reverter (deve bater no trigger)
  const { error: e3 } = await admin.from('DadosFiscaisProfissional').update({ ambiente: 'homologacao' }).eq('owner', idUser);
  console.log('tentativa de reverter via update direto (esperado erro do trigger):', e3?.message || 'SEM ERRO (bug)');

  await admin.from('DadosFiscaisProfissional').delete().eq('owner', idUser);
  await admin.from('Usuarios').delete().eq('id_user', idUser);
  await admin.auth.admin.deleteUser(idUser);
  console.log('cleanup ok');
})();
"
```

Expected: primeira troca afeta 1 linha e vira `producao`; segunda tentativa afeta 0 linhas sem erro (idempotente — não quebra se o profissional clicar duas vezes); tentativa de reverter sempre falha com a mensagem do trigger.

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/actions/dados-fiscais.js web/components/AmbienteNfseForm.js "web/app/(app)/(gestao)/configuracoes/nfse/page.js" && git commit -m "feat: troca homologacao->producao (irreversivel) na tela de NFS-e"
```

---

## Task 11: Tela `/notas-fiscais` — listar pagamentos elegíveis e emitir

**Files:**
- Create: `web/lib/data/notas-fiscais.js`
- Create: `web/lib/actions/notas-fiscais.js`
- Create: `web/components/EmitirNotaFiscalBotao.js`
- Create: `web/app/(app)/(gestao)/notas-fiscais/page.js`
- Modify: `web/components/SidebarNav.js`

**Interfaces:**
- Consumes: `chamarServicoNfse` (Task 7), `enviarEmailNotaFiscal` (Task 7), RPC `registrar_nota_fiscal_pendente` (Task 6).
- Produces: `listarPagamentosElegiveisParaNotaFiscal()`, `listarNotasFiscaisEmitidas()`, `emitirNotaFiscal(pagamentoId, prevState, formData)` — a Task 12 usa a mesma tela/lista pro cancelamento.

- [ ] **Step 1: `web/lib/data/notas-fiscais.js`**

```js
import { createClient } from "@/lib/supabase/server";
import { normalizarIdsLista } from "@/lib/normalizar-ids";

const SELECT_PAGAMENTO =
  "id, valor, data_pagamento, Sessao!inner(id, data, Paciente!inner(id, nome, email, cpf, documento)), NotaFiscal(id)";

export async function listarPagamentosElegiveisParaNotaFiscal() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("PagamentoSessao")
    .select(SELECT_PAGAMENTO)
    .eq("Sessao.Paciente.documento", "nota_fiscal")
    .order("data_pagamento", { ascending: false });

  if (error) throw new Error(error.message);

  return normalizarIdsLista(data, ["id"])
    .filter((p) => (p.NotaFiscal?.length ?? 0) === 0)
    .map((p) => ({
      pagamentoId: p.id,
      valor: p.valor,
      dataPagamento: p.data_pagamento,
      dataSessao: p.Sessao.data,
      pacienteNome: p.Sessao.Paciente.nome,
      pacienteCpf: p.Sessao.Paciente.cpf,
      pacienteEmail: p.Sessao.Paciente.email,
    }));
}

export async function listarNotasFiscaisEmitidas() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("NotaFiscal")
    .select(
      "id, status, numero, serie, chave_acesso, ambiente, erros, created_at, PagamentoSessao(valor, Sessao(Paciente(nome)))"
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return normalizarIdsLista(data, ["id"]).map((n) => ({
    id: n.id,
    status: n.status,
    numero: n.numero,
    serie: n.serie,
    chaveAcesso: n.chave_acesso,
    ambiente: n.ambiente,
    erros: n.erros,
    criadoEm: n.created_at,
    valor: n.PagamentoSessao?.valor,
    pacienteNome: n.PagamentoSessao?.Sessao?.Paciente?.nome ?? "—",
  }));
}
```

- [ ] **Step 2: `web/lib/actions/notas-fiscais.js`**

```js
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { chamarServicoNfse } from "@/lib/nfse-client";
import { enviarEmailNotaFiscal } from "@/lib/email";

export async function emitirNotaFiscal(pagamentoId, prevState, formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autorizado." };

  const { data: pagamento, error: erroPagamento } = await supabase
    .from("PagamentoSessao")
    .select("id, valor, Sessao!inner(id, data, Paciente!inner(id, nome, email, cpf, documento))")
    .eq("id", pagamentoId)
    .single();

  if (erroPagamento || !pagamento) return { error: "Pagamento não encontrado." };
  if (pagamento.Sessao.Paciente.documento !== "nota_fiscal") {
    return { error: "Paciente não está marcado para Nota Fiscal." };
  }
  if (!pagamento.Sessao.Paciente.cpf) {
    return { error: "Paciente sem CPF cadastrado — obrigatório para a nota." };
  }

  const { data: fiscal, error: erroFiscal } = await supabase
    .from("DadosFiscaisProfissional")
    .select("*")
    .eq("owner", user.id)
    .maybeSingle();

  if (erroFiscal || !fiscal) {
    return { error: "Configure seus dados fiscais em Configurações → NFS-e antes de emitir." };
  }
  if (!fiscal.certificado_pfx_cifrado) {
    return { error: "Envie seu certificado digital em Configurações → NFS-e antes de emitir." };
  }
  if (fiscal.certificado_validade && new Date(fiscal.certificado_validade) < new Date()) {
    return { error: "Certificado digital vencido. Envie um novo antes de emitir." };
  }

  const { data: registro, error: erroRegistro } = await supabase.rpc("registrar_nota_fiscal_pendente", {
    p_pagamento_sessao: pagamento.id,
  });

  if (erroRegistro || !registro?.[0]) {
    return { error: "Não foi possível reservar o número da nota: " + (erroRegistro?.message ?? "erro desconhecido") };
  }

  const { id: notaId, numero, serie, ambiente } = registro[0];

  let resultado;
  try {
    resultado = await chamarServicoNfse("/emitir", {
      ambiente,
      certificado_pfx_cifrado: fiscal.certificado_pfx_cifrado,
      certificado_senha_cifrada: fiscal.certificado_senha_cifrada,
      serie,
      numero,
      competencia: pagamento.Sessao.data,
      prestador: {
        documento: fiscal.documento,
        inscricao_municipal: fiscal.inscricao_municipal,
        municipio_ibge: fiscal.municipio_ibge,
        optante_simples_nacional: fiscal.optante_simples_nacional,
        regime_apuracao_sn: fiscal.regime_apuracao_sn,
        codigo_tributacao_nacional: fiscal.codigo_tributacao_nacional,
      },
      tomador: {
        documento: pagamento.Sessao.Paciente.cpf,
        nome: pagamento.Sessao.Paciente.nome,
        email: pagamento.Sessao.Paciente.email || null,
      },
      descricao_servico: `Sessao de psicologia - ${pagamento.Sessao.data}`,
      valor: Number(pagamento.valor),
    });
  } catch (erro) {
    await supabase
      .from("NotaFiscal")
      .update({
        status: "rejeitada",
        erros: [
          {
            codigo: "?",
            titulo: "Falha ao chamar o serviço de emissão",
            explicacao: erro.message,
            acao_sugerida: "Tente novamente em instantes.",
          },
        ],
      })
      .eq("id", notaId);
    revalidatePath("/notas-fiscais");
    return { error: "Falha ao emitir: " + erro.message };
  }

  await supabase
    .from("NotaFiscal")
    .update({
      dps_id: resultado.dps_id,
      xml_dps: Buffer.from(resultado.xml_dps_base64, "base64").toString("utf-8"),
      status: resultado.autorizada ? "autorizada" : "rejeitada",
      chave_acesso: resultado.chave_acesso ?? null,
      xml_nfse: resultado.xml_nfse_base64
        ? Buffer.from(resultado.xml_nfse_base64, "base64").toString("utf-8")
        : null,
      erros: resultado.erros?.length ? resultado.erros : null,
    })
    .eq("id", notaId);

  if (resultado.autorizada && pagamento.Sessao.Paciente.email) {
    try {
      await enviarEmailNotaFiscal({
        paraEmail: pagamento.Sessao.Paciente.email,
        pacienteNome: pagamento.Sessao.Paciente.nome,
        xmlBase64: resultado.xml_nfse_base64,
        pdfBase64: resultado.pdf_base64 ?? null,
      });
    } catch {
      // Nota ja autorizada e persistida -- falha no e-mail nao pode
      // reverter isso nem esconder o sucesso da emissao do operador.
      // O paciente/operador ainda pode acessar o XML pela tela depois.
    }
  }

  revalidatePath("/notas-fiscais");
  return resultado.autorizada
    ? { sucesso: true }
    : { error: "Nota rejeitada: " + (resultado.erros?.[0]?.titulo ?? "erro desconhecido") };
}
```

- [ ] **Step 3: `web/components/EmitirNotaFiscalBotao.js`**

```jsx
"use client";

import { useActionState } from "react";
import { emitirNotaFiscal } from "@/lib/actions/notas-fiscais";

const estadoInicial = {};

export default function EmitirNotaFiscalBotao({ pagamentoId }) {
  const acao = emitirNotaFiscal.bind(null, pagamentoId);
  const [state, formAction, pending] = useActionState(acao, estadoInicial);

  return (
    <form action={formAction} className="text-right">
      <button type="submit" disabled={pending} className="link disabled:opacity-50">
        {pending ? "Emitindo..." : "Emitir nota fiscal"}
      </button>
      {state?.error && <p className="text-xs text-red-600 mt-1 max-w-xs">{state.error}</p>}
    </form>
  );
}
```

- [ ] **Step 4: `web/app/(app)/(gestao)/notas-fiscais/page.js`** (a Task 12 acrescenta o botão de cancelar)

```jsx
import { listarPagamentosElegiveisParaNotaFiscal, listarNotasFiscaisEmitidas } from "@/lib/data/notas-fiscais";
import EmitirNotaFiscalBotao from "@/components/EmitirNotaFiscalBotao";

export default async function PaginaNotasFiscais() {
  const [elegiveis, emitidas] = await Promise.all([
    listarPagamentosElegiveisParaNotaFiscal(),
    listarNotasFiscaisEmitidas(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="page-title">Notas Fiscais</h1>

      <div>
        <h2 className="text-lg font-bold text-navy mb-2">Pagamentos elegíveis</h2>
        {elegiveis.length === 0 ? (
          <p className="empty-state">
            Nenhum pagamento disponível para emissão. Só aparecem aqui pagamentos de pacientes com "Documento"
            marcado como Nota Fiscal no cadastro.
          </p>
        ) : (
          <div className="space-y-3">
            {elegiveis.map((p) => (
              <div key={p.pagamentoId} className="card flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold text-navy">{p.pacienteNome}</p>
                  <p className="text-muted">
                    {p.dataSessao} — R$ {Number(p.valor).toFixed(2)}
                  </p>
                </div>
                <EmitirNotaFiscalBotao pagamentoId={p.pagamentoId} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold text-navy mb-2">Notas emitidas</h2>
        {emitidas.length === 0 ? (
          <p className="empty-state">Nenhuma nota emitida ainda.</p>
        ) : (
          <div className="space-y-3">
            {emitidas.map((n) => (
              <div key={n.id} className="card flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold text-navy">
                    {n.pacienteNome} — Nº {n.numero}/{n.serie}
                  </p>
                  <p className="text-muted">
                    {n.status === "autorizada" && `Autorizada (${n.ambiente})`}
                    {n.status === "rejeitada" && `Rejeitada: ${n.erros?.[0]?.titulo ?? "erro"}`}
                    {n.status === "cancelada" && "Cancelada"}
                    {n.status === "pendente" && "Pendente"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Adicionar ao menu**

Em `web/components/SidebarNav.js`, importar `IconeNotaFiscal` (criado na Task 8) e adicionar em `ITENS_NAV`, logo depois do item `/recibos`:

```js
{ href: "/notas-fiscais", label: "Notas Fiscais", Icone: IconeNotaFiscal },
```

- [ ] **Step 6: Verificar a listagem com dados descartáveis**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const idUser = (await admin.from('Usuarios').select('id_user').limit(1).single()).data.id_user; // reaproveita um usuario existente so pra query de leitura, nao grava nada
  const owner = idUser;
  const { data: consultorioDummy } = await admin.from('Consultorio').insert({ nome: 'C Teste NotasFiscais', owner }).select('id').single();
  const { data: pRecibo } = await admin.from('Paciente').insert({ nome: 'Paciente Recibo', documento: 'recibo', consultorio: consultorioDummy.id, valor_sessao: 100, owner }).select('id').single();
  const { data: pNota } = await admin.from('Paciente').insert({ nome: 'Paciente NotaFiscal', documento: 'nota_fiscal', consultorio: consultorioDummy.id, valor_sessao: 100, owner, cpf: '11122233396' }).select('id').single();

  const { data: sRecibo } = await admin.from('Sessao').insert({ paciente: pRecibo.id, data: '2026-08-01', horario: '10:00', owner, Realizado: true }).select('id').single();
  const { data: sNota } = await admin.from('Sessao').insert({ paciente: pNota.id, data: '2026-08-01', horario: '11:00', owner, Realizado: true }).select('id').single();

  await admin.from('PagamentoSessao').insert({ sessao: sRecibo.id, valor: 100, data_pagamento: '2026-08-01' });
  const { data: pagNota } = await admin.from('PagamentoSessao').insert({ sessao: sNota.id, valor: 150, data_pagamento: '2026-08-01' }).select('id').single();

  const SELECT_PAGAMENTO = 'id, valor, Sessao!inner(Paciente!inner(nome, documento)), NotaFiscal(id)';
  const { data } = await admin.from('PagamentoSessao').select(SELECT_PAGAMENTO).eq('Sessao.Paciente.documento', 'nota_fiscal').in('id', [pagNota.id]);
  console.log('filtro documento=nota_fiscal retorna so o pagamento certo (esperado 1):', data.length, data[0]?.valor);

  await admin.from('PagamentoSessao').delete().in('sessao', [sRecibo.id, sNota.id]);
  await admin.from('Sessao').delete().in('id', [sRecibo.id, sNota.id]);
  await admin.from('Paciente').delete().in('id', [pRecibo.id, pNota.id]);
  await admin.from('Consultorio').delete().eq('id', consultorioDummy.id);
  console.log('cleanup ok');
})();
"
```

Expected: `1 150` (só o pagamento do paciente Nota Fiscal, com o valor certo), `cleanup ok`.

- [ ] **Step 7: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/data/notas-fiscais.js web/lib/actions/notas-fiscais.js web/components/EmitirNotaFiscalBotao.js "web/app/(app)/(gestao)/notas-fiscais" web/components/SidebarNav.js && git commit -m "feat: tela /notas-fiscais - lista pagamentos elegiveis e emite NFS-e"
```

---

## Task 12: Cancelamento de nota fiscal

**Files:**
- Modify: `web/lib/actions/notas-fiscais.js`
- Create: `web/components/CancelarNotaFiscalBotao.js`
- Modify: `web/app/(app)/(gestao)/notas-fiscais/page.js`

**Interfaces:**
- Consumes: `chamarServicoNfse` (Task 7), endpoint `/cancelar` (Task 4).
- Produces: `cancelarNotaFiscal(notaId, motivoTexto, prevState, formData) -> {error}|{sucesso}`.

- [ ] **Step 1: Adicionar a action em `web/lib/actions/notas-fiscais.js`**

```js
export async function cancelarNotaFiscal(notaId, motivoTexto, prevState, formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autorizado." };

  const { data: nota, error: erroNota } = await supabase
    .from("NotaFiscal")
    .select("id, status, chave_acesso, ambiente")
    .eq("id", notaId)
    .single();

  if (erroNota || !nota) return { error: "Nota não encontrada." };
  if (nota.status !== "autorizada") return { error: "Só é possível cancelar notas autorizadas." };

  const { data: fiscal, error: erroFiscal } = await supabase
    .from("DadosFiscaisProfissional")
    .select("documento, certificado_pfx_cifrado, certificado_senha_cifrada")
    .eq("owner", user.id)
    .single();

  if (erroFiscal || !fiscal) return { error: "Dados fiscais não encontrados." };

  let resultado;
  try {
    resultado = await chamarServicoNfse("/cancelar", {
      ambiente: nota.ambiente,
      certificado_pfx_cifrado: fiscal.certificado_pfx_cifrado,
      certificado_senha_cifrada: fiscal.certificado_senha_cifrada,
      chave_acesso: nota.chave_acesso,
      autor_documento: fiscal.documento,
      motivo_texto: motivoTexto || "Cancelamento solicitado pelo prestador",
    });
  } catch (erro) {
    return { error: "Falha ao cancelar: " + erro.message };
  }

  if (!resultado.registrado) {
    return { error: "Cancelamento rejeitado: " + (resultado.erros?.[0]?.titulo ?? "erro desconhecido") };
  }

  await supabase.from("NotaFiscal").update({ status: "cancelada" }).eq("id", notaId);

  revalidatePath("/notas-fiscais");
  return { sucesso: true };
}
```

- [ ] **Step 2: `web/components/CancelarNotaFiscalBotao.js`**

```jsx
"use client";

import { useActionState } from "react";
import { cancelarNotaFiscal } from "@/lib/actions/notas-fiscais";

const estadoInicial = {};

export default function CancelarNotaFiscalBotao({ notaId }) {
  const acao = cancelarNotaFiscal.bind(null, notaId, "Cancelamento solicitado pelo prestador");
  const [state, formAction, pending] = useActionState(acao, estadoInicial);

  function confirmarAntes(event) {
    if (!window.confirm("Cancelar esta nota fiscal? A SEFIN pode rejeitar se o prazo municipal já tiver passado.")) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} onSubmit={confirmarAntes}>
      <button type="submit" disabled={pending} className="link text-red-600 disabled:opacity-50">
        {pending ? "Cancelando..." : "Cancelar nota"}
      </button>
      {state?.error && <p className="text-xs text-red-600 mt-1 max-w-xs">{state.error}</p>}
    </form>
  );
}
```

- [ ] **Step 3: Atualizar a tela**

Em `web/app/(app)/(gestao)/notas-fiscais/page.js`, importar `CancelarNotaFiscalBotao` e trocar o bloco de "Notas emitidas" pra incluir o botão quando `status === "autorizada"`:

```jsx
import CancelarNotaFiscalBotao from "@/components/CancelarNotaFiscalBotao";
```

```jsx
              <div key={n.id} className="card flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold text-navy">
                    {n.pacienteNome} — Nº {n.numero}/{n.serie}
                  </p>
                  <p className="text-muted">
                    {n.status === "autorizada" && `Autorizada (${n.ambiente})`}
                    {n.status === "rejeitada" && `Rejeitada: ${n.erros?.[0]?.titulo ?? "erro"}`}
                    {n.status === "cancelada" && "Cancelada"}
                    {n.status === "pendente" && "Pendente"}
                  </p>
                </div>
                {n.status === "autorizada" && <CancelarNotaFiscalBotao notaId={n.id} />}
              </div>
```

- [ ] **Step 4: Verificar a lógica de bloqueio do cancelamento (status != autorizada)**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const idUser = (await admin.from('Usuarios').select('id_user').limit(1).single()).data.id_user;
  const { data: consultorioDummy } = await admin.from('Consultorio').insert({ nome: 'C Teste Cancel', owner: idUser }).select('id').single();
  const { data: paciente } = await admin.from('Paciente').insert({ nome: 'P Cancel', documento: 'nota_fiscal', consultorio: consultorioDummy.id, valor_sessao: 100, owner: idUser, cpf: '11122233396' }).select('id').single();
  const { data: sessao } = await admin.from('Sessao').insert({ paciente: paciente.id, data: '2026-08-01', horario: '10:00', owner: idUser, Realizado: true }).select('id').single();
  const { data: pagamento } = await admin.from('PagamentoSessao').insert({ sessao: sessao.id, valor: 100, data_pagamento: '2026-08-01' }).select('id').single();
  const { data: nota } = await admin.from('NotaFiscal').insert({ owner: idUser, pagamento_sessao: pagamento.id, status: 'pendente', ambiente: 'homologacao', numero: 1, serie: '1' }).select('id, status').single();

  console.log('nota criada com status pendente:', nota.status);
  console.log('regra da action: so cancela se status === autorizada -- confirmado pela leitura do codigo (nao chama a SEFIN pra status != autorizada)');

  await admin.from('NotaFiscal').delete().eq('id', nota.id);
  await admin.from('PagamentoSessao').delete().eq('id', pagamento.id);
  await admin.from('Sessao').delete().eq('id', sessao.id);
  await admin.from('Paciente').delete().eq('id', paciente.id);
  await admin.from('Consultorio').delete().eq('id', consultorioDummy.id);
  console.log('cleanup ok');
})();
"
```

Expected: `nota criada com status pendente: pendente`, `cleanup ok`.

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/actions/notas-fiscais.js web/components/CancelarNotaFiscalBotao.js "web/app/(app)/(gestao)/notas-fiscais/page.js" && git commit -m "feat: cancelamento de nota fiscal emitida"
```

---

## Task 13: Verificação end-to-end

**Files:** nenhum (só verificação).

**Interfaces:**
- Consumes: todas as anteriores.

- [ ] **Step 1: Verificação autônoma (sem depender de certificado real)**

Tudo que não exige um certificado A1 real nem cadastro municipal de verdade:

1. Confirmar que a migration da Task 6 está aplicada em produção (colunas, RLS, trigger, RPC) — reaproveitar o script da Task 6 Step 3.
2. Subir o microserviço localmente (`.venv\Scripts\uvicorn app.main:app --port 8020`) com as env vars de teste e confirmar `/health`.
3. Build + preview do Next.js local (`npm run build`, depois `node .next/standalone/server.js` — nunca `next start`, que não funciona com `output: standalone` neste projeto, conforme já descoberto nesta sessão), apontando `NFSE_SERVICE_URL=http://localhost:8020`.
4. Via Playwright (mesmo padrão desta sessão, usuário/paciente/pagamento descartáveis, sempre limpos ao final):
   - Logar, ir em `/configuracoes/nfse`, preencher os dados fiscais, salvar, confirmar persistência ao reabrir.
   - Enviar um certificado sintético de teste (gerado como nas Tasks 2/3) — confirmar "Certificado validado e salvo".
   - Confirmar que o botão de troca pra produção aparece e que, ANTES de clicar, o ambiente mostrado é "Homologação".
   - Ir em `/notas-fiscais`, confirmar que um pagamento de teste (paciente `documento = 'nota_fiscal'`, com `PagamentoSessao`) aparece em "Pagamentos elegíveis".
   - Clicar em "Emitir nota fiscal" — como o certificado é sintético (não cadastrado na SEFIN de verdade), a emissão real vai falhar na comunicação com a SEFIN; confirmar que o erro aparece formatado na tela (não uma tela quebrada/500) e que `NotaFiscal.status` vira `rejeitada` com `erros` preenchido — isso já confirma que todo o encanamento (RPC, numeração, chamada ao microserviço, tratamento de erro, persistência) funciona ponta a ponta, só falta o certificado real pra autorizar de verdade.
   - Limpar todos os dados de teste (usuário, paciente, sessão, pagamento, nota fiscal, dados fiscais) via script com service role key.

- [ ] **Step 2: Verificação que exige o certificado real do usuário**

Isto **não** pode ser feito de forma autônoma — precisa do certificado A1 de verdade do profissional (`.pfx` + senha), já com CNPJ/CPF cadastrado no Sistema Nacional NFS-e e Inscrição Municipal ativa. Ver checklist do próprio kit (`docs/INTEGRACAO.md`, seção "Checklist antes da primeira nota real"):

- Confirmar que o município do profissional já aderiu ao Sistema Nacional (https://www.gov.br/nfse).
- Preencher os dados fiscais reais em `/configuracoes/nfse` (produção).
- Enviar o certificado A1 real.
- Emitir uma nota de teste em **homologação** (nunca pular direto pra produção) e confirmar que ela é autorizada de verdade pela SEFIN (produção restrita).
- Só depois disso, trocar pra produção e emitir a primeira nota real.

---

## Notas de infraestrutura (fora do escopo de código, fazer junto do deploy)

- Criar o serviço `psiagente-nfse` no EasyPanel (Task 5).
- Configurar `NFSE_SERVICE_URL`, `NFSE_SERVICE_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` no app principal.
- Configurar `NFSE_SERVICE_SECRET` (mesmo valor) e `NFSE_CERT_ENCRYPTION_KEY` no serviço `psiagente-nfse`.
- Criar conta na Resend e verificar o domínio de envio (`RESEND_FROM_EMAIL`).
