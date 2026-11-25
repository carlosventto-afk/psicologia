"""Testes do DANFSe local (PDF gerado a partir do XML autorizado, layout v2.0).

Rodar a partir de nfse-service/:  python -m unittest discover -s tests -t .
"""
import pathlib
import re
import unittest

from nfse_core.danfse import NORMAL, _ajustar, extrair_campos, gerar_danfse, url_consulta

XML = (pathlib.Path(__file__).parent / "fixtures" / "nfse_autorizada.xml").read_bytes()
CHAVE = "33045572263402300000117000000000015726111560661854"
TOMADOR = b"<toma><CPF>52998224725</CPF><xNome>Paciente de Teste</xNome></toma>"


def _paginas(pdf: bytes) -> int:
    return len(re.findall(rb"/Type /Page\b(?!s)", pdf))


class DanfseTest(unittest.TestCase):
    def test_extrai_campos_principais(self):
        c = extrair_campos(XML)
        self.assertEqual(c["chave"], CHAVE)
        self.assertEqual(c["numero"], "157")
        self.assertEqual(c["emit"]["doc"], "63.402.300/0001-17")
        self.assertEqual(c["toma"]["doc"], "529.982.247-25")
        self.assertEqual(c["valor_servico"], "R$ 3.000,00")
        self.assertEqual(c["competencia"], "28/10/2026")
        self.assertEqual(c["regime_sn"], "Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)")
        self.assertEqual(c["serv_cod"], "04.16.01 / 001")
        self.assertEqual(c["tp_emit"], "Prestador")
        self.assertEqual(c["situacao"], "NFS-e Gerada")

    def test_tomador_com_endereco_e_contato(self):
        rico = XML.replace(
            TOMADOR,
            b"<toma><CPF>52998224725</CPF><xNome>Paciente de Teste</xNome>"
            b"<end><endNac><cMun>3304557</cMun><CEP>20040020</CEP></endNac>"
            b"<xLgr>Rua A</xLgr><nro>10</nro><xBairro>Centro</xBairro></end>"
            b"<fone>21981910295</fone><email>paciente@example.invalid</email></toma>",
        )
        self.assertNotEqual(rico, XML)
        t = extrair_campos(rico)["toma"]
        self.assertEqual(t["fone"], "(21) 98191-0295")
        self.assertEqual(t["email"], "paciente@example.invalid")
        self.assertEqual(t["end"], "Rua A, 10, Centro")
        self.assertEqual(t["ibge_cep"], "33.04557 / 20.040-020")

    def test_qr_usa_o_link_de_consulta_oficial(self):
        self.assertEqual(url_consulta(CHAVE), f"https://www.nfse.gov.br/ConsultaPublica?tpc=1&chave={CHAVE}")
        self.assertIn("producaorestrita", url_consulta(CHAVE, "homologacao"))

    def test_gera_pdf_a4_de_uma_pagina_com_o_conteudo_da_nota(self):
        pdf = gerar_danfse(XML, "producao", comprimir=False)
        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertEqual(_paginas(pdf), 1)
        self.assertRegex(pdf, rb"/MediaBox \[ 0 0 595 842 \]")
        for trecho in (
            b"DANFSe v2.0",
            CHAVE.encode(),
            b"04.16.01 / 001",
            b"R$ 3.000,00",
            b"63.402.300/0001-17",
            b"Totais aproximados dos Tributos cfe. Lei n",
        ):
            self.assertIn(trecho, pdf, trecho)
        self.assertNotIn(b"SEM VALIDADE FISCAL", pdf)

    def test_cabecalho_com_logo_oficial(self):
        self.assertIn(b"/Subtype /Image", gerar_danfse(XML, "producao", comprimir=False))

    def test_homologacao_marca_sem_validade(self):
        pdf = gerar_danfse(XML, "homologacao", comprimir=False)
        self.assertIn(b"SEM VALIDADE FISCAL", pdf)

    def test_texto_longo_e_cortado_na_celula_como_no_oficial(self):
        regime = "Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)"
        largura = 144.5669 - 2 * 3.4016
        self.assertEqual(_ajustar(regime, NORMAL, 7, largura), "Optante - Microempresa ou Empresa de ...")
        self.assertEqual(_ajustar("curto", NORMAL, 7, largura), "curto")

    def test_descricao_muito_longa_continua_em_uma_pagina(self):
        datas = ", ".join(f"{d:02d}/10/2026" for d in range(1, 29))
        longo = XML.replace(b"Atendimento(s) psicologico(s)", f"Atendimentos em {datas} e {datas}.".encode() + b" Atendimento(s)")
        pdf = gerar_danfse(longo, "producao")
        self.assertEqual(_paginas(pdf), 1)

    def test_xml_invalido_levanta(self):
        with self.assertRaises(Exception):
            gerar_danfse(b"<x/>", "producao")


if __name__ == "__main__":
    unittest.main()
