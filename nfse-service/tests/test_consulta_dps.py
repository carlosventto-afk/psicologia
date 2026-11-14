"""Testes da consulta de DPS (resolucao de notas pendentes incertas).

Rodar a partir de nfse-service/:  python -m unittest discover -s tests -t .
"""
import unittest

from nfse_core.dps import montar_dps_id
from nfse_core.resposta import interpretar_consulta_dps


class MontarDpsIdTest(unittest.TestCase):
    def test_cnpj(self):
        self.assertEqual(
            montar_dps_id("12.345.678/0001-90", "3550308", "1", 7),
            "DPS3550308" + "2" + "12345678000190" + "00001" + "000000000000007",
        )

    def test_cpf_usa_tipo_1(self):
        self.assertEqual(montar_dps_id("123.456.789-09", "3550308", "900", 12)[10], "1")

    def test_tamanho(self):
        self.assertEqual(len(montar_dps_id("12345678000190", "3550308", "1", 1)), 45)


class InterpretarConsultaDpsTest(unittest.TestCase):
    def test_encontrada(self):
        self.assertEqual(
            interpretar_consulta_dps({"_http_status": 200, "chaveAcesso": "A" * 50}),
            ("encontrada", "A" * 50),
        )

    def test_nao_encontrada_so_com_404_sem_chave(self):
        self.assertEqual(interpretar_consulta_dps({"_http_status": 404, "erros": []}), ("nao_encontrada", None))

    def test_200_sem_chave_e_incerta(self):
        self.assertEqual(interpretar_consulta_dps({"_http_status": 200}), ("incerta", None))

    def test_outros_status_sao_incertos(self):
        for status in (400, 401, 403, 408, 429):
            self.assertEqual(interpretar_consulta_dps({"_http_status": status}), ("incerta", None))

    def test_404_com_chave_nao_e_nao_encontrada(self):
        self.assertEqual(interpretar_consulta_dps({"_http_status": 404, "chaveAcesso": "X"}), ("incerta", None))


if __name__ == "__main__":
    unittest.main()
