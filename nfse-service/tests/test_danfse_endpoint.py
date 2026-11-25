"""Testes do endpoint /danfse (PDF de varias notas a partir do XML guardado).

Rodar a partir de nfse-service/:  python -m unittest discover -s tests -t .
"""
import base64
import os
import pathlib
import unittest

os.environ["NFSE_SERVICE_SECRET"] = "segredo-de-teste"

from fastapi.testclient import TestClient  # noqa: E402

from app import main  # noqa: E402

XML = (pathlib.Path(__file__).parent / "fixtures" / "nfse_autorizada.xml").read_bytes()
HEADERS = {"X-Nfse-Secret": "segredo-de-teste"}


def _b64(dados: bytes) -> str:
    return base64.b64encode(dados).decode()


def _item(id_, xml=XML, ambiente="producao"):
    return {"id": str(id_), "ambiente": ambiente, "xml_nfse_base64": _b64(xml)}


def _post(corpo, headers=HEADERS):
    return TestClient(main.app).post("/danfse", json=corpo, headers=headers)


class DanfseEndpointTest(unittest.TestCase):
    def test_desenha_o_pdf_de_cada_nota_e_devolve_pelo_id(self):
        resp = _post({"notas": [_item(34), _item(35, ambiente="homologacao")]})
        self.assertEqual(resp.status_code, 200)
        resultados = {r["id"]: r["pdf_base64"] for r in resp.json()["resultados"]}
        self.assertEqual(list(resultados), ["34", "35"])
        for pdf in resultados.values():
            self.assertTrue(base64.b64decode(pdf).startswith(b"%PDF"))

    def test_nota_que_nao_da_para_desenhar_volta_sem_pdf_e_nao_derruba_as_outras(self):
        resp = _post({"notas": [_item(1, xml=b"<x/>"), _item(2), _item(3, ambiente="outro")]})
        self.assertEqual(resp.status_code, 200)
        resultados = {r["id"]: r["pdf_base64"] for r in resp.json()["resultados"]}
        self.assertIsNone(resultados["1"])
        self.assertTrue(base64.b64decode(resultados["2"]).startswith(b"%PDF"))
        self.assertIsNone(resultados["3"])

    def test_base64_invalido_volta_sem_pdf(self):
        resp = _post({"notas": [{"id": "9", "ambiente": "producao", "xml_nfse_base64": "!!não é base64!!"}]})
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.json()["resultados"][0]["pdf_base64"])

    def test_lista_vazia_e_aceita(self):
        resp = _post({"notas": []})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"resultados": []})

    def test_limite_de_100_notas_por_chamada(self):
        resp = _post({"notas": [_item(i, xml=b"<x/>") for i in range(101)]})
        self.assertEqual(resp.status_code, 422)

    def test_exige_segredo(self):
        self.assertEqual(_post({"notas": []}, headers={}).status_code, 422)
        self.assertEqual(_post({"notas": []}, headers={"X-Nfse-Secret": "errado"}).status_code, 401)


if __name__ == "__main__":
    unittest.main()
