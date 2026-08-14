"""Autenticação do microserviço: segredo compartilhado no header, mesmo
padrão já usado em `/carne-leao-automatico` no app principal. Sem sessão de
usuário aqui — quem chama é sempre o Next.js, nunca o navegador."""
import os

from fastapi import Header, HTTPException


async def verificar_segredo(x_nfse_secret: str = Header(...)) -> None:
    esperado = os.environ.get("NFSE_SERVICE_SECRET")
    if not esperado or x_nfse_secret != esperado:
        raise HTTPException(status_code=401, detail="Nao autorizado.")
