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
