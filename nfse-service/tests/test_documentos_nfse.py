"""Testes do endpoint /documentos-nfse (re-busca de XML/PDF de nota autorizada).

Rodar a partir de nfse-service/:  python -m unittest discover -s tests -t .
"""
import base64
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ["NFSE_SERVICE_SECRET"] = "segredo-de-teste"

from fastapi.testclient import TestClient  # noqa: E402

from app import main  # noqa: E402
from nfse_core import SefinError  # noqa: E402

CORPO = {
    "ambiente": "homologacao",
    "certificado_pfx_cifrado": "x",
    "certificado_senha_cifrada": "y",
    "chave_acesso": "A" * 50,
}
HEADERS = {"X-Nfse-Secret": "segredo-de-teste"}


class FakeCliente:
    def __init__(self, falha=False):
        self.falha = falha
        self.consultar_nfse = AsyncMock(side_effect=SefinError("fora") if falha else None, return_value={})
        self.close = AsyncMock()


def _client():
    return TestClient(main.app)


class DocumentosNfseTest(unittest.TestCase):
    def _post(self, corpo=None, cliente=None, pdf=b"%PDF-ok", xml=b"<nfse/>"):
        cliente = cliente or FakeCliente()
        with patch.object(main, "decifrar", lambda v: v), \
             patch.object(main, "SefinClient") as sefin, \
             patch.object(main, "ler_resposta_emissao", return_value=SimpleNamespace(xml_nfse=xml)):
            sefin.return_value = cliente
            sefin.fetch_danfse_pdf = AsyncMock(return_value=pdf)
            resp = _client().post("/documentos-nfse", json={**CORPO, **(corpo or {})}, headers=HEADERS)
            return resp, sefin, cliente

    def test_devolve_xml_e_pdf(self):
        resp, _, _ = self._post()
        self.assertEqual(resp.status_code, 200)
        corpo = resp.json()
        self.assertEqual(base64.b64decode(corpo["pdf_base64"]), b"%PDF-ok")
        self.assertEqual(base64.b64decode(corpo["xml_nfse_base64"]), b"<nfse/>")

    def test_so_busca_o_que_foi_pedido(self):
        resp, sefin, cliente = self._post({"buscar_xml": False})
        self.assertIsNone(resp.json()["xml_nfse_base64"])
        cliente.consultar_nfse.assert_not_called()
        resp, sefin, _ = self._post({"buscar_pdf": False})
        self.assertIsNone(resp.json()["pdf_base64"])
        sefin.fetch_danfse_pdf.assert_not_called()

    def test_indisponibilidade_vira_none_sem_erro(self):
        resp, _, _ = self._post(cliente=FakeCliente(falha=True), pdf=None)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"xml_nfse_base64": None, "pdf_base64": None})

    def test_ambiente_invalido(self):
        resp, _, _ = self._post({"ambiente": "x"})
        self.assertEqual(resp.status_code, 400)

    def test_exige_segredo(self):
        resp = _client().post("/documentos-nfse", json=CORPO)
        self.assertEqual(resp.status_code, 422)
        resp = _client().post("/documentos-nfse", json=CORPO, headers={"X-Nfse-Secret": "errado"})
        self.assertEqual(resp.status_code, 401)


if __name__ == "__main__":
    unittest.main()
