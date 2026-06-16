from typing import Optional
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from models import CobitCoverage, RiskChain
import json
from datetime import datetime

RISK_CHAINS_DEF = [
    {
        "id": "continuidad_sin_bcp",
        "path": ["PO1", "DS4", "DS12"],
        "severity": "critica",
        "condition_process": "DS4",
        "condition_status": ["gap"],
        "description": "El plan estratégico menciona continuidad pero no existe BCP/DRP documentado. Riesgo: interrupción del servicio sin protocolo de respuesta.",
    },
    {
        "id": "seguridad_sin_base",
        "path": ["PO9", "DS5", "ME1"],
        "severity": "alta",
        "condition_process": "PO9",
        "condition_status": ["gap"],
        "description": "Sin metodología formal de gestión de riesgos, los controles de seguridad carecen de fundamento. Riesgo: controles de seguridad no alineados al perfil de riesgo real.",
    },
    {
        "id": "datos_sin_continuidad",
        "path": ["DS11", "DS4"],
        "severity": "alta",
        "condition_process": "DS11",
        "condition_status": ["gap", "partial"],
        "description": "Problemas en la administración de datos combinados con continuidad insuficiente. Riesgo: pérdida de datos ante un incidente.",
    },
    {
        "id": "cambios_sin_control",
        "path": ["AI6", "DS5", "ME2"],
        "severity": "alta",
        "condition_process": "AI6",
        "condition_status": ["gap"],
        "description": "Sin gestión de cambios formal, los cambios no autorizados pueden comprometer la seguridad y la integridad del sistema. Riesgo: cambios no controlados que introducen vulnerabilidades.",
    },
    {
        "id": "incidentes_sin_proceso",
        "path": ["DS8", "DS10", "ME1"],
        "severity": "media",
        "condition_process": "DS8",
        "condition_status": ["gap", "partial"],
        "description": "Sin mesa de servicio formal, los incidentes se gestionan de forma reactiva. Riesgo: tiempos de respuesta altos y pérdida de conocimiento sobre problemas recurrentes.",
    },
    {
        "id": "cumplimiento_sin_monitoreo",
        "path": ["ME3", "ME2", "PO9"],
        "severity": "alta",
        "condition_process": "ME3",
        "condition_status": ["gap"],
        "description": "Sin gestión de cumplimiento regulatorio, los riesgos de sanciones quedan sin detectar. Riesgo: incumplimiento normativo no identificado oportunamente.",
    },
]


async def detect_risk_chains(entity_id: int, session: AsyncSession) -> list[dict]:
    coverage_result = await session.exec(
        select(CobitCoverage).where(CobitCoverage.entity_id == entity_id)
    )
    coverage_map = {c.process_id: c.status for c in coverage_result.all()}

    detected = []

    for chain_def in RISK_CHAINS_DEF:
        cond_proc = chain_def["condition_process"]
        cond_statuses = chain_def["condition_status"]
        current_status = coverage_map.get(cond_proc, "no_data")

        if current_status in cond_statuses:
            detected.append({
                "chain_id": chain_def["id"],
                "path": chain_def["path"],
                "severity": chain_def["severity"],
                "description": chain_def["description"],
                "processes_coverage": {pid: coverage_map.get(pid, "no_data") for pid in chain_def["path"]},
            })

    await _save_chains(entity_id, detected, session)
    return detected


async def _save_chains(entity_id: int, chains: list[dict], session: AsyncSession):
    existing = await session.exec(
        select(RiskChain).where(RiskChain.entity_id == entity_id, RiskChain.auto_generated == 1)
    )
    for old in existing.all():
        await session.delete(old)

    for chain in chains:
        rc = RiskChain(
            entity_id=entity_id,
            chain_id=chain["chain_id"],
            chain_path=json.dumps(chain["path"]),
            description=chain["description"],
            severity=chain["severity"],
            auto_generated=1,
            created_at=datetime.utcnow(),
        )
        session.add(rc)

    await session.commit()
