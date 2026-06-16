import json
from io import BytesIO
from datetime import datetime


def generate_pdf(entity: dict, findings: list[dict], coverage: list[dict], chains: list[dict]) -> bytes:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        from reportlab.lib.enums import TA_CENTER, TA_LEFT

        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4,
                                rightMargin=2*cm, leftMargin=2*cm,
                                topMargin=2.5*cm, bottomMargin=2*cm)

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle("Title2", parent=styles["Heading1"], fontSize=18, spaceAfter=8, alignment=TA_CENTER)
        h2_style = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=13, spaceAfter=6, textColor=colors.HexColor("#1e40af"))
        body_style = ParagraphStyle("Body2", parent=styles["Normal"], fontSize=9, spaceAfter=4, leading=13)
        label_style = ParagraphStyle("Label", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#6b7280"))

        SEVERITY_COLORS = {
            "critica": colors.HexColor("#fee2e2"),
            "alta": colors.HexColor("#fef3c7"),
            "media": colors.HexColor("#dbeafe"),
            "baja": colors.HexColor("#f0fdf4"),
        }

        story = []

        story.append(Paragraph("INFORME DE AUDITORÍA DE TI", title_style))
        story.append(Paragraph(f"COBIT 4.1 — {entity.get('name', '?').upper()}", title_style))
        story.append(Spacer(1, 0.3*cm))
        story.append(Paragraph(f"Fecha de emisión: {datetime.now().strftime('%d/%m/%Y')}", label_style))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e5e7eb")))
        story.append(Spacer(1, 0.5*cm))

        # Summary
        story.append(Paragraph("1. RESUMEN EJECUTIVO", h2_style))
        included = [f for f in findings if f.get("status") == "included"]
        gap_count = len([c for c in coverage if c.get("status") == "gap"])
        partial_count = len([c for c in coverage if c.get("status") == "partial"])
        compliant_count = len([c for c in coverage if c.get("status") == "compliant"])

        summary_text = f"""
La presente auditoría de TI fue realizada sobre <b>{entity.get('name', '?')}</b>, organización del sector <b>{entity.get('industry', 'N/A')}</b>.
Se evaluaron los procesos COBIT 4.1 en alcance, identificando {gap_count} procesos con brechas críticas,
{partial_count} con cumplimiento parcial y {compliant_count} con cumplimiento satisfactorio.
Se documentaron {len(included)} hallazgos formales para inclusión en este reporte.
"""
        story.append(Paragraph(summary_text.strip(), body_style))
        story.append(Spacer(1, 0.4*cm))

        # Coverage table
        story.append(Paragraph("2. RESUMEN DE COBERTURA COBIT 4.1", h2_style))
        STATUS_LABEL = {"compliant": "Cumple", "partial": "Parcial", "gap": "Brecha", "no_data": "Sin datos", "not_scoped": "N/A"}
        STATUS_COLOR = {
            "compliant": colors.HexColor("#d1fae5"),
            "partial": colors.HexColor("#fef3c7"),
            "gap": colors.HexColor("#fee2e2"),
            "no_data": colors.HexColor("#f9fafb"),
            "not_scoped": colors.HexColor("#f9fafb"),
        }
        cov_data = [["Proceso", "Nombre", "Estado", "Evidencias"]]
        for c in coverage:
            if c.get("status") == "not_scoped":
                continue
            row_color = STATUS_COLOR.get(c.get("status", "no_data"), colors.white)
            cov_data.append([
                c.get("process_id", ""),
                c.get("name", "")[:45],
                STATUS_LABEL.get(c.get("status", "no_data"), "?"),
                str(c.get("evidence_count", 0)),
            ])

        if len(cov_data) > 1:
            t = Table(cov_data, colWidths=[2*cm, 9*cm, 2.5*cm, 2.5*cm])
            t.setStyle(TableStyle([
                ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#1e40af")),
                ("TEXTCOLOR", (0,0), (-1,0), colors.white),
                ("FONTSIZE", (0,0), (-1,-1), 8),
                ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#e5e7eb")),
                ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
                ("ALIGN", (2,0), (-1,-1), "CENTER"),
                ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
                ("PADDING", (0,0), (-1,-1), 4),
            ]))
            story.append(t)
        story.append(Spacer(1, 0.5*cm))

        # Findings
        story.append(Paragraph("3. HALLAZGOS Y OBSERVACIONES", h2_style))
        for i, f in enumerate(included, 1):
            obs_raw = f.get("formal_observation")
            obs = {}
            if obs_raw:
                try:
                    obs = json.loads(obs_raw)
                except Exception:
                    pass

            sev_color = SEVERITY_COLORS.get(f.get("severity", "baja"), colors.white)
            story.append(Paragraph(f"Hallazgo {i}: {f.get('title', '?')}", h2_style))
            story.append(Paragraph(f"Proceso: {f.get('process_id')} | Severidad: {f.get('severity', '?').upper()}", label_style))

            if obs:
                for label, key in [("Condición", "condicion"), ("Criterio", "criterio"),
                                    ("Causa", "causa"), ("Efecto", "efecto"), ("Recomendación", "recomendacion")]:
                    if obs.get(key):
                        story.append(Paragraph(f"<b>{label}:</b> {obs[key]}", body_style))
            else:
                story.append(Paragraph(f.get("description", ""), body_style))
                if f.get("auditor_notes"):
                    story.append(Paragraph(f"<i>Notas del auditor:</i> {f['auditor_notes']}", label_style))
            story.append(Spacer(1, 0.3*cm))

        # Risk chains
        if chains:
            story.append(Paragraph("4. CADENAS DE RIESGO IDENTIFICADAS", h2_style))
            for chain in chains:
                path_str = " → ".join(chain.get("path", []))
                story.append(Paragraph(f"<b>{path_str}</b> [{chain.get('severity','?').upper()}]", body_style))
                story.append(Paragraph(chain.get("description", ""), body_style))
                story.append(Spacer(1, 0.2*cm))

        doc.build(story)
        return buffer.getvalue()

    except Exception as e:
        return f"[Error generando PDF: {e}]".encode()
