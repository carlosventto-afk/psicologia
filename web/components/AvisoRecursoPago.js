import Link from "next/link";

export default function AvisoRecursoPago({ recurso }) {
  return (
    <div className="card p-6 text-center space-y-3">
      <p className="text-navy font-semibold">{recurso} está disponível nos planos pagos.</p>
      <Link href="/assinatura" className="btn-primary inline-block">
        Ver planos
      </Link>
    </div>
  );
}
