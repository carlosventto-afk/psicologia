"""Testes do leiaute DPS v1.01 (NT 009) contra os XSDs oficiais.

Rodar a partir de nfse-service/:  python -m unittest discover -s tests -t .
"""
from __future__ import annotations

import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

from lxml import etree

from nfse_core.dps import (
    DPS_V101_CUTOVER,
    NFSE_NS,
    DpsData,
    build_dps_xml,
    resolve_layout,
)

XSD_DIR = Path(__file__).resolve().parent.parent / "nfse_core" / "xsd_v101"
BRT = timezone(timedelta(hours=-3))


def _schema(name: str) -> etree.XMLSchema:
    return etree.XMLSchema(etree.parse(str(XSD_DIR / name)))


def _dados(tp_amb: int, layout: str | None = None, **kw) -> DpsData:
    base = dict(
        tp_amb=tp_amb,
        dh_emi=datetime(2026, 11, 13, 10, 0, 0, tzinfo=BRT),
        serie="1",
        numero=7,
        competencia=date(2026, 11, 13),
        prest_cnpj="63402300000117",
        c_loc_emi="3304557",
        op_simp_nac=3,
        reg_ap_trib_sn=1,
        toma_cpf_cnpj="11144477735",
        toma_nome="Maria da Silva",
        c_trib_nac="041601",
        x_desc_serv="Atendimento psicologico",
        v_serv=Decimal("1.00"),
        layout=layout,
    )
    base.update(kw)
    return DpsData(**base)


class LayoutSelectionTest(unittest.TestCase):
    def test_homologacao_sempre_v101(self):
        self.assertEqual(resolve_layout(2, date(2026, 11, 13)), "1.01")

    def test_producao_antes_do_corte_v100(self):
        self.assertEqual(resolve_layout(1, DPS_V101_CUTOVER - timedelta(days=1)), "1.00")

    def test_producao_a_partir_do_corte_v101(self):
        self.assertEqual(resolve_layout(1, DPS_V101_CUTOVER), "1.01")


class DpsV101Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.xsd = _schema("DPS_v1.01.xsd")

    def _validar(self, xml: bytes):
        doc = etree.fromstring(xml)
        self.assertTrue(self.xsd.validate(doc), str(self.xsd.error_log))

    def test_minimo_valida(self):
        self._validar(build_dps_xml(_dados(2)))

    def test_versao_e_finnfse(self):
        root = etree.fromstring(build_dps_xml(_dados(2)))
        self.assertEqual(root.get("versao"), "1.01")
        ns = {"n": NFSE_NS}
        self.assertEqual(root.xpath("string(//n:finNFSe)", namespaces=ns), "0")

    def test_completo_valida(self):
        xml = build_dps_xml(_dados(
            2, prest_im="12345", c_trib_mun="001", c_nbs="123456789",
            toma_email="a@b.com", p_aliq=Decimal("2.00"),
        ))
        self._validar(xml)

    def test_nao_simples_valida(self):
        self._validar(build_dps_xml(_dados(2, op_simp_nac=1, reg_ap_trib_sn=None)))

    def test_assinado_valida(self):
        try:
            from cryptography import x509  # noqa: F401
            from nfse_core.signer import sign_dps
        except Exception as exc:  # pragma: no cover
            self.skipTest(f"signer indisponivel: {exc}")
        pfx, senha = _pfx_teste()
        assinado = sign_dps(build_dps_xml(_dados(2)), pfx, senha)
        self._validar(assinado)


class DpsV100Test(unittest.TestCase):
    def test_producao_antes_do_corte_continua_v100(self):
        xml = build_dps_xml(_dados(1, layout="1.00", p_aliq=Decimal("2.00"), c_nbs="123456789"))
        root = etree.fromstring(xml)
        ns = {"n": NFSE_NS}
        self.assertEqual(root.get("versao"), "1.00")
        self.assertEqual(root.xpath("count(//n:finNFSe)", namespaces=ns), 0)
        inf = root[0]
        self.assertEqual([etree.QName(c).localname for c in inf][:9],
                         ["tpAmb", "dhEmi", "verAplic", "serie", "nDPS", "dCompet", "tpEmit", "cLocEmi", "prest"])
        cserv = root.xpath("//n:cServ", namespaces=ns)[0]
        self.assertEqual([etree.QName(c).localname for c in cserv], ["cTribNac", "xDescServ", "cNBS"])
        trib = root.xpath("//n:tribMun", namespaces=ns)[0]
        self.assertEqual([etree.QName(c).localname for c in trib], ["tribISSQN", "pAliq", "tpRetISSQN"])

    def test_layout_invalido(self):
        with self.assertRaises(ValueError):
            build_dps_xml(_dados(1, layout="9.99"))


def _pfx_teste():
    import datetime as dt
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives.serialization import pkcs12
    from cryptography.x509.oid import NameOID

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "TESTE")])
    now = dt.datetime.now(dt.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name)
            .public_key(key.public_key()).serial_number(1)
            .not_valid_before(now - dt.timedelta(days=1))
            .not_valid_after(now + dt.timedelta(days=30)).sign(key, hashes.SHA256()))
    pfx = pkcs12.serialize_key_and_certificates(
        b"t", key, cert, None, serialization.BestAvailableEncryption(b"senha"))
    import base64
    return base64.b64encode(pfx).decode(), "senha"


if __name__ == "__main__":
    unittest.main()
