"""Testes do DANFSe local (PDF gerado a partir do XML autorizado).

Rodar a partir de nfse-service/:  python -m unittest discover -s tests -t .
"""
import pathlib
import unittest

from nfse_core.danfse import extrair_campos, gerar_danfse

XML = (pathlib.Path(__file__).parent / "fixtures" / "nfse_autorizada.xml").read_bytes()


class DanfseTest(unittest.TestCase):
    def test_extrai_campos_principais(self):
        c = extrair_campos(XML)
        self.assertEqual(c["chave"], "33045572263402300000117000000000015726111560661854")
        self.assertEqual(c["numero"], "157")
        self.assertEqual(c["emit_doc"], "63.402.300/0001-17")
        self.assertEqual(c["toma_doc"], "529.982.247-25")
        self.assertEqual(c["valor_servico"], "R$ 3.000,00")
        self.assertEqual(c["competencia"], "28/10/2026")

    def test_gera_pdf_de_uma_pagina(self):
        pdf = gerar_danfse(XML, "producao")
        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertGreater(len(pdf), 2000)

    def test_homologacao_marca_sem_validade(self):
        self.assertTrue(gerar_danfse(XML, "homologacao").startswith(b"%PDF"))

    def test_xml_invalido_levanta(self):
        with self.assertRaises(Exception):
            gerar_danfse(b"<x/>", "producao")


if __name__ == "__main__":
    unittest.main()
